import { describe, expect, it } from "vitest";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import { DeleteEntry, GetEntryDetail, UpdateEntry, UpdateGroupEntry } from "./change-entry";
import { RecordEntry } from "./record-entry";
import { RecordRepayment } from "./record-repayment";
import { SaveReceiptEntry } from "./save-receipt-entry";

const FAN = "p-fan"; // seeded by createFakeRepos

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
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    const out = await s.update.execute(entry.id, { total: 12000, note: "ข้าว", split: { kind: "equal", people: [FAN] } });
    expect(out).toMatchObject({ total: 12000, othersShare: 6000, note: "ข้าว" });
  });

  it("keeps the shares when only the amount changes, unless it no longer fits", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    expect((await s.update.execute(entry.id, { total: 9000 })).othersShare).toBe(5000);
    await expect(s.update.execute(entry.id, { total: 4000 })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
  });

  it("freezes amount, split and date once someone paid part of it back; the note, category and wallet stay editable", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    await s.repay.execute({ personId: FAN, amount: 1000 });
    for (const patch of [{ total: 20000 }, { split: { kind: "none" as const } }, { occurredAt: new Date("2026-10-01T05:00:00Z") }]) {
      await expect(s.update.execute(entry.id, patch)).rejects.toMatchObject({ code: "ENTRY_REPAID" });
    }
    await expect(s.update.execute(entry.id, { note: "ข้าว", walletId: "w-bank", occurredAt: entry.occurredAt })).resolves.toMatchObject({ note: "ข้าว" });
  });

  it("refuses moving an unpaid entry's date before one already paid (it would take that repayment)", async () => {
    const s = setup();
    const old = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "theirs", people: [FAN] }, occurredAt: new Date("2026-10-01T05:00:00Z") });
    const later = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "theirs", people: [FAN] }, occurredAt: new Date("2026-10-02T05:00:00Z") });
    await s.repay.execute({ personId: FAN, amount: 5000 }); // pays `old` only
    await expect(s.update.execute(later.entry.id, { occurredAt: new Date("2026-09-30T05:00:00Z") })).rejects.toMatchObject({ code: "ENTRY_REPAID" });
    await expect(s.update.execute(later.entry.id, { total: 20000 })).resolves.toMatchObject({ total: 20000 });
    expect(old.entry.id).not.toBe(later.entry.id);
  });

  it("refuses raising a repayment above what someone owes", async () => {
    const s = setup();
    await s.record.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    const { entry } = await s.repay.execute({ personId: FAN, amount: 4000 });
    await expect(s.update.execute(entry.id, { total: 6000 })).rejects.toMatchObject({ code: "BALANCE_WOULD_GO_NEGATIVE" });
    await expect(s.update.execute(entry.id, { total: 5000 })).resolves.toMatchObject({ total: 5000 });
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
      lines: [{ rawName: "a", canonicalName: "a", qty: 1, price: 5000, owners: { me: true, people: [] } }],
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
        { rawName: "นม", canonicalName: "นม", qty: 1, price: 1000, owners: { me: true, people: [] } },
        { rawName: "ไก่", canonicalName: "ไก่", qty: 1, price: 5000, owners: { me: false, people: [FAN] } },
      ],
    });
    expect(entry).toMatchObject({ source: "itemized", merchant: "ค่า 7-11", othersShare: 5000 });
    await expect(s.update.execute(entry.id, { split: { kind: "none" } })).rejects.toMatchObject({ code: "ENTRY_LOCKED" });
  });

  it("re-splits to other people, and never to someone who isn't set up", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "expense", total: 9000, split: { kind: "equal", people: [FAN] } });
    const out = await s.update.execute(entry.id, { split: { kind: "equal", people: [FAN, "p-a"] } });
    expect(out.shares).toEqual([{ personId: FAN, amount: 3000 }, { personId: "p-a", amount: 3000 }]);
    await expect(s.update.execute(entry.id, { split: { kind: "theirs", people: ["ghost"] } })).rejects.toMatchObject({
      code: "UNKNOWN_PERSON",
    });
  });

  it("rejects splits on income and unknown ids", async () => {
    const s = setup();
    const { entry } = await s.record.execute({ kind: "income", total: 5000 });
    await expect(s.update.execute(entry.id, { split: { kind: "equal", people: [FAN] } })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
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
    const { entry } = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    await s.repay.execute({ personId: FAN, amount: 5000 });
    await expect(s.del.execute(entry.id)).rejects.toMatchObject({ code: "ENTRY_REPAID" });
  });

  it("refuses to delete a paid-back entry even when the balance would stay positive", async () => {
    const s = setup();
    const old = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "theirs", people: [FAN] }, occurredAt: new Date("2026-10-01T05:00:00Z") });
    const later = await s.record.execute({ kind: "expense", total: 10000, split: { kind: "theirs", people: [FAN] }, occurredAt: new Date("2026-10-02T05:00:00Z") });
    await s.repay.execute({ personId: FAN, amount: 5000 });
    // before: the 50 baht silently moved onto `later`
    await expect(s.del.execute(old.entry.id)).rejects.toMatchObject({ code: "ENTRY_REPAID" });
    await expect(s.del.execute(later.entry.id)).resolves.toBeUndefined();
  });

  it("deleting a repayment is fine (balance goes up)", async () => {
    const s = setup();
    await s.record.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    const { entry } = await s.repay.execute({ personId: FAN, amount: 5000 });
    await expect(s.del.execute(entry.id)).resolves.toBeUndefined();
  });

  it("unknown id -> NOT_FOUND", async () => {
    await expect(setup().del.execute("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("UpdateGroupEntry / GetEntryDetail", () => {
  const line = (canonicalName: string, price: number, owners = { me: true, people: [] as string[] }) => ({ rawName: canonicalName, canonicalName, qty: 1, price, owners });
  function group() {
    const s = setup();
    const clock = new FixedClock(NOW);
    return {
      ...s,
      save: new SaveReceiptEntry(s.f.tx, clock),
      edit: new UpdateGroupEntry(s.f.tx, clock),
      detail: new GetEntryDetail(s.f.repos),
    };
  }

  it("shows the lines, then replaces them and recomputes total and shares", async () => {
    const s = group();
    const { entry } = await s.save.execute({ source: "itemized", merchant: "ค่า 7-11", total: 5000, lines: [line("นม", 2000, { me: false, people: [FAN] }), line("ไก่", 3000)] });
    expect((await s.detail.execute(entry.id)).lines.map((l) => l.canonicalName)).toEqual(["นม", "ไก่"]);

    const updated = await s.edit.execute(entry.id, {
      merchant: "7-11", total: 9000, people: [FAN],
      lines: [line("นม", 2000, { me: false, people: [FAN] }), line("ไก่", 3000), line("แชมพู", 4000, { me: true, people: [FAN] })],
    });
    expect(updated).toMatchObject({ merchant: "7-11", total: 9000, shares: [{ personId: FAN, amount: 4000 }] });
    const d = await s.detail.execute(entry.id);
    expect(d.lines.map((l) => [l.canonicalName, l.price])).toEqual([["นม", 2000], ["ไก่", 3000], ["แชมพู", 4000]]);
    expect(d.repaidBy).toEqual([]);
    expect(s.f.memory.get("แชมพู")).toEqual({ me: true, people: [FAN] });
  });

  it("is refused once someone paid part of it back, and says who", async () => {
    const s = group();
    const { entry } = await s.save.execute({ source: "receipt", total: 2000, lines: [line("นม", 2000, { me: false, people: [FAN] })] });
    await s.repay.execute({ personId: FAN, amount: 500 });
    expect((await s.detail.execute(entry.id)).repaidBy).toEqual([FAN]);
    await expect(s.edit.execute(entry.id, { total: 2000, lines: [line("นม", 2000)] })).rejects.toMatchObject({ code: "ENTRY_REPAID" });
    await expect(s.del.execute(entry.id)).rejects.toMatchObject({ code: "ENTRY_REPAID" });
  });

  it("only edits group entries", async () => {
    const s = group();
    const { entry } = await s.record.execute({ kind: "expense", total: 100 });
    await expect(s.edit.execute(entry.id, { total: 100, lines: [line("x", 100)] })).rejects.toMatchObject({ code: "INVALID_RECEIPT" });
    await expect(s.edit.execute("nope", { total: 100, lines: [line("x", 100)] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
