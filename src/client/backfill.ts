import type { SingleCard } from "./draftCards";
import { whenOfDay } from "./presetChoices";
import type { CategoryDTO, ReceiptDraftDTO } from "./types";

/** One past entry waiting on the review screen, before anything is saved. Amount is satang. */
export interface BackfillRow {
  key: string;
  day: string; // YYYY-MM-DD, Bangkok
  description: string;
  amount: number;
  kind: "expense" | "income";
  categoryId: string | null;
  selected: boolean;
  /** Looks like something already on file: unticked until the user says otherwise. */
  duplicate: boolean;
}

/** A date we can't read, or one in the future, becomes today. */
export const clampDay = (day: string | null, today: string): string => (day && day <= today ? day : today);

function categoryId(categories: CategoryDTO[], name: string | null, kind: "expense" | "income"): string | null {
  return categories.find((c) => c.name === name && c.kind === kind && !c.archived)?.id ?? null;
}

/**
 * Turns whatever the scan returned into review rows. A history page gives one row per transaction;
 * anything else (a slip, a receipt among several pictures) gives one row for what was paid.
 */
export function rowsFromDraft(draft: ReceiptDraftDTO, categories: CategoryDTO[], today: string, keyPrefix: string): BackfillRow[] {
  if (draft.kind === "history") {
    return draft.transactions.map((t, i) => {
      const kind = t.direction === "in" ? "income" : "expense";
      return {
        key: `${keyPrefix}-${i}`,
        day: clampDay(t.date, today),
        description: t.description,
        amount: t.amount,
        kind,
        categoryId: categoryId(categories, t.categoryName, kind),
        selected: true,
        duplicate: false,
      };
    });
  }
  const priciest = draft.lines.reduce<ReceiptDraftDTO["lines"][number] | undefined>((a, b) => (!a || b.price > a.price ? b : a), undefined);
  const amount = draft.total > 0 ? draft.total : draft.lines.reduce((s, l) => s + l.price, 0);
  if (amount <= 0) return [];
  return [
    {
      key: `${keyPrefix}-0`,
      day: clampDay(draft.date, today),
      description: draft.merchant ?? priciest?.canonicalName ?? "",
      amount,
      kind: "expense",
      categoryId: categoryId(categories, priciest?.categoryName ?? null, "expense"),
      selected: true,
      duplicate: false,
    },
  ];
}

/** Marks the rows the server thinks we already have, and unticks them. */
export const applyDuplicates = (rows: BackfillRow[], duplicates: boolean[]): BackfillRow[] =>
  rows.map((r, i) => (duplicates[i] ? { ...r, duplicate: true, selected: false } : r));

/** The rows as review cards, so a bank-history page is reviewed exactly like a spoken sentence. */
export const cardsFromRows = (rows: BackfillRow[], today: string): SingleCard[] =>
  rows.map((r) => ({
    type: "single",
    id: r.key,
    kind: r.kind,
    amount: r.amount > 0 ? String(r.amount / 100) : "",
    categoryId: r.categoryId,
    note: r.description,
    split: "none",
    personIds: [],
    walletId: null,
    uncertain: [],
    when: whenOfDay(r.day, today),
    selected: r.selected,
    duplicate: r.duplicate,
  }));
