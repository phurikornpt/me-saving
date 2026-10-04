import { DomainError } from "@/domain/errors";
import type { Satang } from "@/domain/money";
import { spendAiBudget, type AiLimit } from "../ai-budget";
import type { CategoryRepo, Clock, LoginAttemptRepo, PersonRepo, TextEntryParser, WalletRepo } from "../ports";

export const MAX_ENTRY_TEXT = 300;

export type DraftField = "amount" | "category" | "person" | "wallet";

export interface EntryTextDraft {
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

/**
 * Turns one typed or spoken sentence into an editable draft entry. Nothing is saved.
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

  async execute(rawText: string): Promise<EntryTextDraft> {
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

    const uncertain = new Set<DraftField>(parsed.uncertain);
    const amount = parsed.amount !== null && parsed.amount > 0 ? parsed.amount : null;
    if (amount === null) uncertain.add("amount");

    // Anything that isn't a name/key we handed out is ignored, never trusted.
    const category = usableCategories.find((c) => c.kind === parsed.kind && c.name === parsed.categoryName);
    if (!category) uncertain.add("category");

    const personIds = [...new Set(parsed.personKeys)].flatMap((k) => people.find((p) => p.key === k)?.id ?? []);
    let split = parsed.kind === "income" ? "none" : parsed.split;
    if (split !== "none" && personIds.length === 0) {
      split = "none"; // a split with nobody to split with: the user picks the person
      uncertain.add("person");
    }
    if (split === "none") personIds.length = 0;

    const wallet = wallets.find((w) => w.key === parsed.walletKey);
    if (parsed.walletKey && !wallet) uncertain.add("wallet");

    return {
      kind: parsed.kind,
      amount,
      categoryId: category?.id ?? null,
      note: parsed.note?.trim().slice(0, 200) || null,
      split,
      personIds,
      walletId: wallet?.id ?? null,
      uncertain: [...uncertain],
    };
  }
}
