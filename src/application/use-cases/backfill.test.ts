import { describe, expect, it } from "vitest";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import { FindDuplicates } from "./find-duplicates";
import { RecordBackfill } from "./record-backfill";
import { RecordEntry } from "./record-entry";

const NOON = new Date("2026-10-03T05:00:00Z"); // 12:00 Bangkok
const at = (day: string) => new Date(`${day}T12:00:00+07:00`);

function setup() {
  const fake = createFakeRepos();
  const clock = new FixedClock(NOON);
  return {
    ...fake,
    backfill: new RecordBackfill(fake.tx, clock),
    record: new RecordEntry(fake.tx, clock),
    dupes: new FindDuplicates(fake.repos.entries),
  };
}

describe("RecordBackfill", () => {
  it("saves every row on its own day, but counts as ONE log of today", async () => {
    const s = setup();
    const out = await s.backfill.execute({
      rows: [
        { kind: "expense", total: 5500, occurredAt: at("2026-09-28"), note: "กาแฟ" },
        { kind: "expense", total: 12000, occurredAt: at("2026-09-29") },
        { kind: "income", total: 90000, occurredAt: at("2026-09-30"), categoryId: "c-salary" },
      ],
    });
    expect(out.entries).toHaveLength(3);
    expect(s.entries.map((e) => e.occurredAt.toISOString())).toEqual([
      at("2026-09-28").toISOString(),
      at("2026-09-29").toISOString(),
      at("2026-09-30").toISOString(),
    ]);
    expect(out).toMatchObject({ xpGained: 10, streak: 1 }); // first log of today, once
    expect([...s.days.keys()]).toEqual(["2026-10-03"]); // the days the rows belong to are NOT marked logged
    expect(s.entries[0]).toMatchObject({ note: "กาแฟ", source: "manual", shares: [] });
  });

  it("is all or nothing", async () => {
    const s = setup();
    await expect(
      s.backfill.execute({
        rows: [
          { kind: "expense", total: 5500, occurredAt: at("2026-09-28") },
          { kind: "expense", total: 0, occurredAt: at("2026-09-29") },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    expect(s.entries).toHaveLength(0);
  });

  it("refuses an empty or oversized batch", async () => {
    const s = setup();
    await expect(s.backfill.execute({ rows: [] })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    const row = { kind: "expense" as const, total: 100, occurredAt: at("2026-09-28") };
    await expect(s.backfill.execute({ rows: Array(61).fill(row) })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });
});

describe("FindDuplicates", () => {
  it("flags a row with the same day, kind and amount as an entry on file", async () => {
    const s = setup();
    await s.record.execute({ kind: "expense", total: 5500, occurredAt: at("2026-09-28") });
    const flags = await s.dupes.execute([
      { day: "2026-09-28", total: 5500, kind: "expense", description: "A" }, // same
      { day: "2026-09-28", total: 5500, kind: "income", description: "B" }, // other kind
      { day: "2026-09-29", total: 5500, kind: "expense", description: "C" }, // other day
      { day: "2026-09-28", total: 5600, kind: "expense", description: "D" }, // other amount
    ]);
    expect(flags).toEqual([true, false, false, false]);
  });

  it("flags the repeat of an identical row in the same batch (overlapping screenshots), not the first", async () => {
    const s = setup();
    const row = { day: "2026-09-28", total: 3000, kind: "expense" as const, description: "7-Eleven" };
    expect(await s.dupes.execute([row, { ...row, description: " 7-ELEVEN " }, { ...row, total: 4000 }])).toEqual([false, true, false]);
  });

  it("two same-priced rows with different descriptions are not duplicates of each other", async () => {
    const s = setup();
    const row = { day: "2026-09-28", total: 3000, kind: "expense" as const };
    expect(await s.dupes.execute([{ ...row, description: "กาแฟ" }, { ...row, description: "ข้าว" }])).toEqual([false, false]);
  });
});
