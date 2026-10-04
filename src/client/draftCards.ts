import { parseBaht } from "@/domain/money";
import type { api } from "./api";
import { occurredAtOf, type WhenChoice } from "./presetChoices";
import type { EntryDraftDTO, SplitMode } from "./types";

export const MAX_CARDS = 60; // same limit as the server
export type CardSplit = "none" | "equal" | "theirs";
type Field = "amount" | "category" | "person" | "wallet";

export interface LineCard {
  id: string;
  note: string;
  amount: string; // baht as typed
  categoryId: string | null;
  me: boolean;
  personIds: string[];
  uncertain: Field[];
}
export interface SingleCard {
  type: "single";
  id: string;
  kind: "expense" | "income";
  amount: string;
  categoryId: string | null;
  note: string;
  split: CardSplit;
  personIds: string[];
  walletId: string | null;
  uncertain: Field[];
  when: WhenChoice;
  /** Unticked cards stay on screen but are not saved (a possible duplicate of something already on file). */
  selected: boolean;
  duplicate: boolean;
}
export interface GroupCard {
  type: "group";
  id: string;
  name: string;
  walletId: string | null;
  lines: LineCard[];
  uncertain: Field[];
  when: WhenChoice;
  selected: boolean;
  duplicate: boolean;
}
export type Card = SingleCard | GroupCard;
export type BatchItems = Parameters<typeof api.recordBatch>[0]["items"];

let seq = 0;
const nextId = () => `c${++seq}`;
const baht = (satang: number | null) => (satang ? String(satang / 100) : "");

/** Safe satang of what was typed: 0 when empty or unreadable. */
export function satangOf(text: string): number {
  try {
    return text ? parseBaht(text) : 0;
  } catch {
    return 0;
  }
}

export function fromDrafts(drafts: EntryDraftDTO[]): Card[] {
  return drafts.map((d): Card =>
    d.mode === "single"
      ? {
          type: "single", id: nextId(), kind: d.kind, amount: baht(d.amount), categoryId: d.categoryId, note: d.note ?? "",
          split: d.split, personIds: d.personIds, walletId: d.walletId, uncertain: d.uncertain,
          when: { kind: "now" }, selected: true, duplicate: false,
        }
      : {
          type: "group", id: nextId(), name: d.name ?? "", walletId: d.walletId, uncertain: d.uncertain,
          when: { kind: "now" }, selected: true, duplicate: false,
          lines: d.lines.map((l) => ({
            id: nextId(), note: l.note ?? "", amount: baht(l.amount), categoryId: l.categoryId,
            me: l.owners.me, personIds: l.owners.people, uncertain: l.uncertain,
          })),
        },
  );
}

const splitOfLine = (l: Pick<LineCard, "me" | "personIds">): CardSplit => (l.personIds.length === 0 ? "none" : l.me ? "equal" : "theirs");
const lineOf = (c: SingleCard): LineCard => ({
  id: nextId(), note: c.note, amount: c.amount, categoryId: c.categoryId,
  me: c.split !== "theirs", personIds: c.split === "none" ? [] : c.personIds, uncertain: c.uncertain.filter((f) => f !== "wallet") as Field[],
});
/** A line leaving its group keeps the group's wallet and time. */
const singleOf = (l: LineCard, from: GroupCard): SingleCard => ({
  type: "single", id: nextId(), kind: "expense", amount: l.amount, categoryId: l.categoryId, note: l.note,
  split: splitOfLine(l), personIds: l.personIds, walletId: from.walletId, uncertain: l.uncertain,
  when: from.when, selected: from.selected, duplicate: false,
});

export const update = (cards: Card[], id: string, patch: Partial<SingleCard> | Partial<GroupCard>): Card[] =>
  cards.map((c) => (c.id === id ? ({ ...c, ...patch } as Card) : c));
export const updateLine = (cards: Card[], lineId: string, patch: Partial<LineCard>): Card[] =>
  cards.map((c) => (c.type === "group" ? { ...c, lines: c.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } : c));
export const removeCard = (cards: Card[], id: string): Card[] => cards.filter((c) => c.id !== id);

/** A group left with no lines disappears; with one line it stays a group until the user splits it. */
const dropEmpty = (cards: Card[]): Card[] => cards.filter((c) => c.type !== "group" || c.lines.length > 0);

export function removeLine(cards: Card[], lineId: string): Card[] {
  return dropEmpty(cards.map((c) => (c.type === "group" ? { ...c, lines: c.lines.filter((l) => l.id !== lineId) } : c)));
}

/** Moves a line into another group, or out to its own single card (`to` = "single"). */
export function moveLine(cards: Card[], lineId: string, to: string | "single"): Card[] {
  const from = cards.find((c): c is GroupCard => c.type === "group" && c.lines.some((l) => l.id === lineId));
  const line = from?.lines.find((l) => l.id === lineId);
  if (!from || !line || to === from.id) return cards;
  if (to === "single") {
    if (cards.length >= MAX_CARDS) return cards;
    return dropEmpty([...removeLine(cards, lineId), singleOf(line, from)]);
  }
  if (!cards.some((c) => c.id === to && c.type === "group")) return cards;
  return dropEmpty(cards.map((c): Card => {
    if (c.type !== "group") return c;
    if (c.id === from.id) return { ...c, lines: c.lines.filter((l) => l.id !== lineId) };
    if (c.id === to) return { ...c, lines: [...c.lines, line] };
    return c;
  }));
}

/** Expense cards can be merged: `id` joins `into` (a group), or both become a new group. */
export function mergeCards(cards: Card[], id: string, into: string): Card[] {
  const a = cards.find((c) => c.id === id);
  const b = cards.find((c) => c.id === into);
  const isExpense = (c?: Card): c is Card => !!c && (c.type === "group" || c.kind === "expense");
  if (!isExpense(a) || !isExpense(b) || a.id === b.id) return cards;
  const linesOf = (c: Card) => (c.type === "group" ? c.lines : [lineOf(c)]);
  const merged: GroupCard = {
    type: "group",
    id: b.id,
    name: b.type === "group" ? b.name : a.type === "group" ? a.name : "",
    walletId: b.walletId,
    when: b.when,
    selected: b.selected || a.selected,
    duplicate: false,
    uncertain: b.uncertain.includes("wallet") ? ["wallet"] : [],
    lines: [...linesOf(b), ...linesOf(a)],
  };
  return cards.filter((c) => c.id !== a.id).map((c) => (c.id === b.id ? merged : c));
}

/** A group becomes one single card per line (kept in place). */
export function splitGroup(cards: Card[], id: string): Card[] {
  const g = cards.find((c): c is GroupCard => c.type === "group" && c.id === id);
  if (!g || cards.length - 1 + g.lines.length > MAX_CARDS) return cards;
  return cards.flatMap((c) => (c.id === id ? g.lines.map((l) => singleOf(l, g)) : [c]));
}

export const groupTotal = (g: GroupCard) => g.lines.reduce((s, l) => s + satangOf(l.amount), 0);
export const cardTotal = (c: Card) => (c.type === "group" ? groupTotal(c) : satangOf(c.amount));

/** Why the whole set can't be saved yet, in Thai; null when it can. */
export function cardsProblem(all: Card[]): string | null {
  const cards = all.filter((c) => c.selected);
  if (cards.length === 0) return all.length === 0 ? "ไม่มีรายการ" : "ติ๊กอย่างน้อย 1 รายการ";
  if (cards.length > MAX_CARDS) return `บันทึกได้ครั้งละไม่เกิน ${MAX_CARDS} รายการ`;
  for (const c of cards) {
    if (c.type === "single") {
      if (satangOf(c.amount) <= 0) return "ใส่จำนวนเงินให้ครบก่อน";
      if (c.kind === "expense" && c.split !== "none" && c.personIds.length === 0) return "เลือกคนที่หารด้วยให้ครบก่อน";
    } else {
      if (c.lines.length === 0) return "กลุ่มต้องมีของอย่างน้อย 1 อย่าง";
      for (const l of c.lines) {
        if (satangOf(l.amount) <= 0) return "ใส่ราคาของทุกอย่างในกลุ่มก่อน";
        if (!l.me && l.personIds.length === 0) return "เลือกคนที่ต้องจ่ายของทุกอย่างในกลุ่มก่อน";
      }
    }
  }
  return null;
}

/** The headline number on the save button: expenses if there are any, else incomes. */
export function headlineTotal(all: Card[]): number {
  const cards = all.filter((c) => c.selected);
  const expenses = cards.filter((c) => c.type === "group" || c.kind === "expense");
  return (expenses.length > 0 ? expenses : cards).reduce((s, c) => s + cardTotal(c), 0);
}

export function splitMode(c: SingleCard): SplitMode | undefined {
  return c.kind !== "expense" || c.split === "none" || c.personIds.length === 0 ? undefined : { kind: c.split, people: c.personIds };
}

/** What /api/entries/batch takes. Call only when `cardsProblem` is null. */
export function toBatchItems(cards: Card[]): BatchItems {
  return cards.filter((c) => c.selected).map((c): BatchItems[number] => {
    const walletId = c.walletId ?? undefined;
    const occurredAt = occurredAtOf(c.when);
    if (c.type === "single") {
      return { type: "entry", kind: c.kind, total: satangOf(c.amount), categoryId: c.categoryId, note: c.note.trim() || null, split: splitMode(c), walletId, occurredAt };
    }
    return {
      type: "group", source: "itemized", merchant: c.name.trim() || null, total: groupTotal(c), walletId, occurredAt,
      people: [...new Set(c.lines.flatMap((l) => l.personIds))],
      lines: c.lines.map((l) => ({
        rawName: l.note.trim() || "รายการ", canonicalName: l.note.trim() || "รายการ", qty: 1, price: satangOf(l.amount),
        owners: { me: l.me, people: l.personIds }, categoryId: l.categoryId,
      })),
    };
  });
}

export function usedCategoryIds(cards: Card[]): string[] {
  return cards.filter((c) => c.selected).flatMap((c) => (c.type === "single" ? [c.categoryId] : c.lines.map((l) => l.categoryId))).filter((x): x is string => !!x);
}
