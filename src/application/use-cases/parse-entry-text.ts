import { DomainError } from "@/domain/errors";
import type { Satang } from "@/domain/money";
import { spendAiBudget, type AiLimit } from "../ai-budget";
import type { CategoryRepo, Clock, LoginAttemptRepo, PersonRepo, TextEntryParser, WalletRepo } from "../ports";

export const MAX_ENTRY_TEXT = 500;

export type DraftField = "amount" | "category" | "person" | "wallet";

/** One entry (an expense, or income) ready to edit. */
export interface SingleDraft {
  mode: "single";
  kind: "expense" | "income";
  /** Null when no amount was said: the user must type one. */
  amount: Satang | null;
  categoryId: string | null;
  note: string | null;
  /** "none" whenever no valid person was named, and always for income. */
  split: "none" | "equal" | "theirs";
  personIds: string[];
  /** Null = the default wallet. */
  walletId: string | null;
  /** Fields to highlight: the AI was unsure, or named something we don't have. */
  uncertain: DraftField[];
}

export interface DraftLine {
  note: string | null;
  amount: Satang | null;
  categoryId: string | null;
  owners: { me: boolean; people: string[] };
  uncertain: Exclude<DraftField, "wallet">[];
}

/** Several things bought together ("ค่า 7-11": นม, ไก่ ...), saved as one group. */
export interface GroupDraft {
  mode: "group";
  name: string | null;
  walletId: string | null;
  /** Everyone named on a line. */
  personIds: string[];
  lines: DraftLine[];
  uncertain: "wallet"[];
}

export type EntryDraft = SingleDraft | GroupDraft;

/**
 * Turns one typed or spoken sentence into editable draft entries (one sentence can describe several). Nothing is saved.
 * Counts against the shared daily AI budget, like a receipt scan.
 */
export class ParseEntryText {
  constructor(
    private readonly parser: TextEntryParser,
    private readonly categories: CategoryRepo,
    private readonly people: PersonRepo,
    private readonly wallets: Pick<WalletRepo, "list">,
    private readonly budget: LoginAttemptRepo,
    private readonly clock: Clock,
    private readonly limit: AiLimit,
  ) {}

  async execute(rawText: string): Promise<{ drafts: EntryDraft[] }> {
    const text = rawText.trim();
    if (text.length === 0) throw new DomainError("INVALID_TEXT", "say or type something first");
    if (text.length > MAX_ENTRY_TEXT) throw new DomainError("INVALID_TEXT", `text is longer than ${MAX_ENTRY_TEXT} characters`);

    await spendAiBudget(this.budget, this.clock, this.limit); // failed calls count too: they still cost quota

    const [categories, everyone, allWallets] = await Promise.all([this.categories.list(), this.people.list(), this.wallets.list()]);
    const usableCategories = categories.filter((c) => !c.archived);
    // Short keys, so the model never has to copy an id back correctly.
    const people = everyone.filter((p) => !p.archived).map((p, i) => ({ ...p, key: `p${i + 1}` }));
    const wallets = allWallets.filter((w) => !w.archived).map((w, i) => ({ ...w, key: `w${i + 1}` }));

    const parsed = await this.parser.parse(text, {
      categories: usableCategories.map(({ name, kind }) => ({ name, kind })),
      people: people.map(({ key, name, note }) => ({ key, name, note })),
      wallets: wallets.map(({ key, name }) => ({ key, name })),
    });

    const drafts = parsed.entries.flatMap((entry): EntryDraft[] => {
      const wallet = wallets.find((w) => w.key === entry.walletKey);
      const walletUncertain = entry.uncertain.includes("wallet") || (entry.walletKey !== null && !wallet);
      const walletId = wallet?.id ?? null;

      // Anything that isn't a name/key we handed out is ignored, never trusted.
      const items = entry.items.map((item) => {
        const uncertain = new Set(item.uncertain);
        const amount = item.amount !== null && item.amount > 0 ? item.amount : null;
        if (amount === null) uncertain.add("amount");
        const category = usableCategories.find((c) => c.kind === entry.kind && c.name === item.categoryName);
        if (!category) uncertain.add("category");
        const personIds = [...new Set(item.personKeys)].flatMap((k) => people.find((p) => p.key === k)?.id ?? []);
        let me = item.me;
        if (entry.kind === "income") {
          personIds.length = 0;
          me = true;
          uncertain.delete("person");
        } else if (personIds.length === 0) {
          me = true; // nobody valid to share with: it's ours, the user picks the person
          if (!item.me || item.personKeys.length > 0) uncertain.add("person");
        }
        return {
          note: item.note?.trim().slice(0, 200) || null,
          amount,
          categoryId: category?.id ?? null,
          me,
          personIds,
          uncertain: [...uncertain],
        };
      });

      const single = (item: (typeof items)[number]): SingleDraft => ({
        mode: "single",
        kind: entry.kind,
        amount: item.amount,
        categoryId: item.categoryId,
        note: item.note ?? (items.length === 1 ? entry.name?.trim().slice(0, 200) || null : null),
        split: item.personIds.length === 0 ? "none" : item.me ? "equal" : "theirs",
        personIds: item.personIds,
        walletId,
        uncertain: [...item.uncertain, ...(walletUncertain ? (["wallet"] as const) : [])],
      });

      if (entry.kind === "income" || items.length === 1) return items.map(single);
      return [
        {
          mode: "group",
          name: entry.name?.trim().slice(0, 100) || null,
          walletId,
          personIds: [...new Set(items.flatMap((i) => i.personIds))],
          lines: items.map((i) => ({
            note: i.note,
            amount: i.amount,
            categoryId: i.categoryId,
            owners: { me: i.me, people: i.personIds },
            uncertain: i.uncertain,
          })),
          uncertain: walletUncertain ? ["wallet"] : [],
        },
      ];
    });

    if (drafts.length === 0) throw new DomainError("AI_UNAVAILABLE", "nothing to read in the result");
    return { drafts };
  }
}
