import { describe, expect, it } from "vitest";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import { DeleteEntry, UpdateEntry } from "./change-entry";
import { RecordEntry } from "./record-entry";
import { RecordRepayment } from "./record-repayment";
import { SaveReceiptEntry } from "./save-receipt-entry";

const NOW = new Date("2026-10-03T05:00:00Z");

function setup() {
  const f = createFakeRepos();
  const clock = new FixedClock(NOW);
  return {
    f,
    record: new RecordEntry(f.tx, clock),
    repay: new RecordRepayment(f.tx, clock),
    update: new UpdateEntry(f.tx),
    del: new DeleteEntry(f.tx),
  };
}

describe("UpdateEntry", () => {
  it("edits amount, category and note and recomputes the split", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "split" } });
    const out = await s.update.execute(entry.id, { total: 12000, note: "ข้าว", split: { kind: "split" } });
    expect(out).toMatchObject({ total: 12000, partnerShare: 6000, note: "ข้าว" });
  });

  it("keeps the partner share when only the amount changes, unless it no longer fits", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "split" } });
    expect((await s.update.execute(entry.id, { total: 9000 })).partnerShare).toBe(5000);
    await expect(s.update.execute(entry.id, { total: 4000 })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
  });

  it("refuses an edit that would make repayments exceed what the partner owes", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "split" } });
    await s.repay.execute({ amount: 4000 });
    await expect(s.update.execute(entry.id, { split: { kind: "none" } })).rejects.toMatchObject({
      code: "BALANCE_WOULD_GO_NEGATIVE",
    });
  });

  it("doesn't award XP or touch streak", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 100 });
    const xp = s.f.xp.length;
    await s.update.execute(entry.id, { note: "x" });
    expect(s.f.xp).toHaveLength(xp);
  });

  it("locks amount and split on receipt entries but allows the note", async () => {
    const s = setup();
    const { entry } = await new SaveReceiptEntry(s.f.tx, new FixedClock(NOW)).execute({
      total: 5000,
      lines: [{ rawName: "a", canonicalName: "a", qty: 1, price: 5000, owner: "me" }],
    });
    await expect(s.update.execute(entry.id, { total: 6000 })).rejects.toMatchObject({ code: "ENTRY_LOCKED" });
    expect((await s.update.execute(entry.id, { note: "ok" })).note).toBe("ok");
  });

  it("locks hand-typed groups the same way", async () => {
    const s = setup();
    const { entry } = await new SaveReceiptEntry(s.f.tx, new FixedClock(NOW)).execute({
      source: "itemized",
      merchant: "ค่า 7-11",
      total: 6000,
      lines: [
        { rawName: "นม", canonicalName: "นม", qty: 1, price: 1000, owner: "me" },
        { rawName: "ไก่", canonicalName: "ไก่", qty: 1, price: 5000, owner: "partner" },
      ],
    });
    expect(entry).toMatchObject({ source: "itemized", merchant: "ค่า 7-11", partnerShare: 5000 });
    await expect(s.update.execute(entry.id, { split: { kind: "none" } })).rejects.toMatchObject({ code: "ENTRY_LOCKED" });
  });

  it("rejects splits on income and unknown ids", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "income", total: 5000 });
    await expect(s.update.execute(entry.id, { split: { kind: "split" } })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
    await expect(s.update.execute("nope", { note: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("DeleteEntry", () => {
  it("deletes an entry", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 100 });
    await s.del.execute(entry.id);
    expect(s.f.entries).toHaveLength(0);
  });

  it("refuses to delete a fronted expense that repayments already cover", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "split" } });
    await s.repay.execute({ amount: 5000 });
    await expect(s.del.execute(entry.id)).rejects.toMatchObject({ code: "BALANCE_WOULD_GO_NEGATIVE" });
  });

  it("deleting a repayment is fine (balance goes up)", async () => {
    const s = setup();
    await s.record.execute({ kind: "expense", total: 10000, split: { kind: "split" } });
    const { entry } = await s.repay.execute({ amount: 5000 });
    await expect(s.del.execute(entry.id)).resolves.toBeUndefined();
  });

  it("unknown id -> NOT_FOUND", async () => {
    await expect(setup().del.execute("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
