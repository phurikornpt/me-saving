import { describe, expect, it } from "vitest";
import { applyDuplicates, cardsFromRows, clampDay, rowsFromDraft, type BackfillRow } from "./backfill";
import type { CategoryDTO, DraftLineDTO, ReceiptDraftDTO } from "./types";

const TODAY = "2026-10-03";
const cats: CategoryDTO[] = [
  { id: "food", name: "อาหาร", icon: "restaurant", kind: "expense", sort: 0, archived: false },
  { id: "old", name: "เก่า", icon: "more_horiz", kind: "expense", sort: 1, archived: true },
  { id: "pay", name: "เงินเดือน", icon: "payments", kind: "income", sort: 0, archived: false },
];
const draft = (p: Partial<ReceiptDraftDTO>): ReceiptDraftDTO => ({
  kind: "receipt", merchant: null, date: null, total: 0, lines: [], transactions: [], sumMismatch: false, ...p,
});
const line = (canonicalName: string, price: number, categoryName: string | null = null): DraftLineDTO => ({
  rawName: canonicalName, canonicalName, qty: 1, price, categoryName, owners: { me: true, people: [] }, ownerSource: "default", lowConfidence: false,
});
const row = (p: Partial<BackfillRow> = {}): BackfillRow => ({
  key: "k", day: "2026-09-28", description: "x", amount: 100, kind: "expense", categoryId: null, selected: true, duplicate: false, ...p,
});

describe("clampDay", () => {
  it("keeps a past day, turns unreadable or future days into today", () => {
    expect(clampDay("2026-09-28", TODAY)).toBe("2026-09-28");
    expect(clampDay(null, TODAY)).toBe(TODAY);
    expect(clampDay("2026-12-01", TODAY)).toBe(TODAY);
  });
});

describe("rowsFromDraft", () => {
  it("a history page gives one row per transaction, matching categories by kind", () => {
    const rows = rowsFromDraft(
      draft({
        kind: "history",
        transactions: [
          { date: "2026-09-28", description: "7-Eleven", amount: 5500, direction: "out", categoryName: "อาหาร" },
          { date: null, description: "เงินเดือน", amount: 3000000, direction: "in", categoryName: "เงินเดือน" },
          { date: "2026-09-27", description: "ร้านเก่า", amount: 100, direction: "out", categoryName: "เก่า" }, // archived
          { date: "2026-09-27", description: "สลับ", amount: 100, direction: "in", categoryName: "อาหาร" }, // wrong kind
        ],
      }),
      cats, TODAY, "a",
    );
    expect(rows.map((r) => [r.day, r.kind, r.categoryId])).toEqual([
      ["2026-09-28", "expense", "food"],
      [TODAY, "income", "pay"],
      ["2026-09-27", "expense", null],
      ["2026-09-27", "income", null],
    ]);
    expect(rows.every((r) => r.selected && !r.duplicate)).toBe(true);
    expect(new Set(rows.map((r) => r.key)).size).toBe(4);
  });

  it("a slip or receipt gives one expense row for what was paid", () => {
    const [r, ...rest] = rowsFromDraft(
      draft({ kind: "delivery", merchant: null, date: "2026-09-30", total: 9000, lines: [line("ชา", 2000), line("ข้าวมันไก่", 6000, "อาหาร")] }),
      cats, TODAY, "b",
    );
    expect(rest).toEqual([]);
    expect(r).toMatchObject({ day: "2026-09-30", description: "ข้าวมันไก่", amount: 9000, kind: "expense", categoryId: "food" });
  });

  it("falls back to the sum of the lines when the paid total was unreadable, and skips an empty read", () => {
    const l = line("a", 700);
    expect(rowsFromDraft(draft({ total: 0, lines: [l] }), cats, TODAY, "c")[0].amount).toBe(700);
    expect(rowsFromDraft(draft({ total: 0, lines: [] }), cats, TODAY, "d")).toEqual([]);
  });
});

describe("review state", () => {
  it("duplicates are flagged and unticked", () => {
    const out = applyDuplicates([row({ key: "a" }), row({ key: "b" })], [false, true]);
    expect(out.map((r) => [r.selected, r.duplicate])).toEqual([[true, false], [false, true]]);
  });
});

describe("cardsFromRows", () => {
  it("turns rows into single cards: a past day at noon, today as now, baht as text, ticks kept", () => {
    const cards = cardsFromRows(
      [row({ key: "a", description: "กาแฟ", amount: 5550, categoryId: "food" }), row({ key: "b", day: TODAY, kind: "income", amount: 0, selected: false, duplicate: true })],
      TODAY,
    );
    expect(cards[0]).toMatchObject({ type: "single", id: "a", kind: "expense", amount: "55.5", note: "กาแฟ", categoryId: "food", selected: true, when: { kind: "at", day: "2026-09-28", hour: 12, minute: 0 } });
    expect(cards[1]).toMatchObject({ kind: "income", amount: "", selected: false, duplicate: true, when: { kind: "now" } });
  });
});
