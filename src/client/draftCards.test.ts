import { describe, expect, it } from "vitest";
import {
  cardsProblem, fromDrafts, headlineTotal, mergeCards, moveLine, removeLine, splitGroup, toBatchItems, updateLine,
  type GroupCard, type SingleCard,
} from "./draftCards";
import type { EntryDraftDTO } from "./types";

const single = (o: object = {}): EntryDraftDTO => ({
  mode: "single", kind: "expense", amount: 6000, categoryId: "c1", note: "ข้าว", split: "none", personIds: [], walletId: null, uncertain: [], ...o,
});
const group = (name = "7-11"): EntryDraftDTO => ({
  mode: "group", name, walletId: "w1", personIds: ["fan"], uncertain: [],
  lines: [
    { note: "นม", amount: 3000, categoryId: "c1", owners: { me: false, people: ["fan"] }, uncertain: [] },
    { note: "ไก่", amount: 4500, categoryId: null, owners: { me: true, people: [] }, uncertain: ["category"] },
  ],
});
const groups = (cards: ReturnType<typeof fromDrafts>) => cards.filter((c): c is GroupCard => c.type === "group");

describe("draft cards", () => {
  it("builds editable cards: baht as text, owners kept", () => {
    const [s, g] = fromDrafts([single(), group()]);
    expect(s).toMatchObject({ type: "single", amount: "60", note: "ข้าว" });
    expect((g as GroupCard).lines.map((l) => [l.amount, l.me, l.personIds])).toEqual([["30", false, ["fan"]], ["45", true, []]]);
  });

  it("moves a line out to a single card, keeping its owners as a split", () => {
    const cards = fromDrafts([group()]);
    const out = moveLine(cards, (cards[0] as GroupCard).lines[0].id, "single");
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ type: "single", kind: "expense", amount: "30", split: "theirs", personIds: ["fan"], walletId: "w1" });
    expect(groups(out)[0].lines).toHaveLength(1);
  });

  it("moves a line between groups; an emptied group disappears", () => {
    const cards = fromDrafts([group("A"), group("B")]);
    const [a, b] = groups(cards);
    let out = moveLine(cards, a.lines[0].id, b.id);
    expect(groups(out).map((g) => g.lines.length)).toEqual([1, 3]);
    out = moveLine(out, groups(out)[0].lines[0].id, b.id);
    expect(groups(out)).toHaveLength(1);
    expect(groups(out)[0].lines).toHaveLength(4);
  });

  it("merges expenses into a group, and ignores incomes", () => {
    const cards = fromDrafts([single(), single({ amount: 2000, note: "น้ำ", split: "equal", personIds: ["fan"] }), single({ kind: "income" })]);
    const merged = mergeCards(cards, cards[0].id, cards[1].id);
    expect(merged).toHaveLength(2);
    expect(groups(merged)[0].lines.map((l) => [l.note, l.amount, l.me, l.personIds])).toEqual([["น้ำ", "20", true, ["fan"]], ["ข้าว", "60", true, []]]);
    expect(mergeCards(cards, cards[0].id, cards[2].id)).toBe(cards);
    const withGroup = fromDrafts([single(), group()]);
    expect(groups(mergeCards(withGroup, withGroup[0].id, withGroup[1].id))[0].lines).toHaveLength(3);
  });

  it("splits a group into one single per line, but never past the card limit", () => {
    const cards = fromDrafts([group()]);
    const out = splitGroup(cards, cards[0].id);
    expect(out.map((c) => c.type)).toEqual(["single", "single"]);
    expect((out[0] as SingleCard).split).toBe("theirs");
    const crowded = fromDrafts([group(), ...Array(59).fill(single())]);
    expect(splitGroup(crowded, crowded[0].id)).toBe(crowded);
  });

  it("removing the last line removes the group", () => {
    const cards = fromDrafts([group()]);
    const g = cards[0] as GroupCard;
    expect(removeLine(removeLine(cards, g.lines[0].id), g.lines[1].id)).toEqual([]);
  });

  it("is only saveable when every card is complete", () => {
    expect(cardsProblem(fromDrafts([single(), group()]))).toBeNull();
    expect(cardsProblem([])).not.toBeNull();
    expect(cardsProblem(fromDrafts([single({ amount: null })]))).toContain("จำนวนเงิน");
    expect(cardsProblem(fromDrafts([single({ split: "equal" })]))).toContain("เลือกคน");
    const g = fromDrafts([group()]);
    expect(cardsProblem(updateLine(g, (g[0] as GroupCard).lines[0].id, { amount: "" }))).toContain("ราคา");
    expect(cardsProblem(updateLine(g, (g[0] as GroupCard).lines[0].id, { personIds: [] }))).toContain("เลือกคน");
    expect(cardsProblem(fromDrafts(Array(61).fill(single())))).toContain("60");
  });

  it("shows the expense total in the headline, incomes only when that's all there is", () => {
    expect(headlineTotal(fromDrafts([single({ kind: "income", amount: 99900 }), single(), group()]))).toBe(6000 + 7500);
    expect(headlineTotal(fromDrafts([single({ kind: "income", amount: 99900 })]))).toBe(99900);
  });

  it("builds the batch call: entries with splits, groups as itemized with per-line owners", () => {
    const items = toBatchItems(fromDrafts([single({ split: "equal", personIds: ["fan"] }), group()]));
    expect(items[0]).toMatchObject({ type: "entry", kind: "expense", total: 6000, split: { kind: "equal", people: ["fan"] }, walletId: undefined });
    expect(items[1]).toMatchObject({
      type: "group", source: "itemized", merchant: "7-11", total: 7500, people: ["fan"], walletId: "w1",
      lines: [
        { canonicalName: "นม", qty: 1, price: 3000, owners: { me: false, people: ["fan"] } },
        { canonicalName: "ไก่", price: 4500, owners: { me: true, people: [] } },
      ],
    });
  });

  it("sends each card's own time, and leaves unticked cards out of everything", () => {
    const cards = fromDrafts([single(), group(), single({ amount: 1000 })]);
    const at = { kind: "at" as const, day: "2026-10-01", hour: 9, minute: 30 };
    const timed = cards.map((c, i) => (i === 0 ? { ...c, when: at } : i === 2 ? { ...c, selected: false } : c));
    const items = toBatchItems(timed);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ occurredAt: "2026-10-01T02:30:00.000Z" });
    expect(items[1]).toMatchObject({ occurredAt: undefined });
    expect(headlineTotal(timed)).toBe(6000 + 7500);
    expect(cardsProblem(timed.map((c, i) => (i === 2 ? { ...c, amount: "" } : c)))).toBeNull(); // an unticked card needs no amount
    expect(cardsProblem(timed.map((c) => ({ ...c, selected: false })))).toContain("ติ๊ก");
  });

  it("a line split out of a group keeps the group's time", () => {
    const [g] = fromDrafts([group()]);
    const at = { kind: "at" as const, day: "2026-10-01", hour: 9, minute: 0 };
    const out = splitGroup([{ ...g, when: at } as GroupCard], g.id);
    expect(out.every((c) => c.type === "single" && c.when === at)).toBe(true);
  });
});
