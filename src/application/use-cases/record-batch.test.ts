import { describe, expect, it } from "vitest";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import { RecordBatch, type BatchItem } from "./record-batch";

const NOON = new Date("2026-10-03T05:00:00Z");
const ME = { me: true, people: [] as string[] };

function setup() {
  const f = createFakeRepos();
  return { f, uc: new RecordBatch(f.tx, new FixedClock(NOON)) };
}

const income: BatchItem = { type: "entry", kind: "income", total: 2500000 };
const lunch: BatchItem = { type: "entry", kind: "expense", total: 6000, note: "ข้าว", split: { kind: "equal", people: ["p-fan"] } };
const group: BatchItem = {
  type: "group",
  merchant: "7-11",
  total: 7500,
  lines: [
    { rawName: "นม", canonicalName: "นม", qty: 1, price: 3000, owners: { me: false, people: ["p-fan"] } },
    { rawName: "ไก่", canonicalName: "ไก่", qty: 1, price: 4500, owners: ME },
  ],
};

describe("RecordBatch", () => {
  it("saves entries and groups together, and counts as ONE log (XP, streak)", async () => {
    const { f, uc } = setup();
    const out = await uc.execute({ items: [income, lunch, group] });
    expect(out.entries.map((e) => [e.kind, e.total])).toEqual([["income", 2500000], ["expense", 6000], ["expense", 7500]]);
    expect(f.entries).toHaveLength(3);
    expect(f.lines).toHaveLength(2);
    expect(out.entries[1].shares).toEqual([{ personId: "p-fan", amount: 3000 }]);
    expect(out.entries[2].shares).toEqual([{ personId: "p-fan", amount: 3000 }]);
    expect(out).toMatchObject({ xpGained: 10, streak: 1 });
  });

  it("an item's own wallet wins over the batch wallet", async () => {
    const { uc } = setup();
    const out = await uc.execute({ walletId: "w-bank", items: [income, { ...lunch, walletId: "w-cash" } as BatchItem] });
    expect(out.entries.map((e) => e.walletId)).toEqual(["w-bank", "w-cash"]);
  });

  it("is all or nothing: one invalid item saves nothing and logs nothing", async () => {
    const { f, uc } = setup();
    await expect(uc.execute({ items: [lunch, group, { type: "entry", kind: "expense", total: 0 }] })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(uc.execute({ items: [lunch, { ...group, lines: [] } as BatchItem] })).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
    await expect(uc.execute({ items: [lunch, { ...lunch, split: { kind: "equal", people: ["nobody"] } } as BatchItem] })).rejects.toBeDefined();
    expect(f.entries).toHaveLength(0);
    expect(f.lines).toHaveLength(0);
    expect(f.days.size).toBe(0);
  });

  it("refuses an empty batch, more than 60 items, and an unknown wallet", async () => {
    const { uc } = setup();
    await expect(uc.execute({ items: [] })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(uc.execute({ items: Array(61).fill(income) })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(uc.execute({ walletId: "nope", items: [income] })).rejects.toMatchObject({ code: "UNKNOWN_WALLET" });
  });
});
