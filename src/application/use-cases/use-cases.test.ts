import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { addDays } from "@/domain/day";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import type { PresetPrice, PresetRecord, PresetRepo } from "../ports";
import { ManagePresets } from "./manage-settings";
import { MarkNoSpendDay } from "./mark-no-spend-day";
import { RecordEntry } from "./record-entry";
import { RecordRepayment } from "./record-repayment";

const FAN = "p-fan"; // seeded by createFakeRepos

// 2026-10-03 12:00 Bangkok = 05:00Z
const NOON = new Date("2026-10-03T05:00:00Z");

function setup(now = NOON) {
  const fake = createFakeRepos();
  const clock = new FixedClock(now);
  return {
    ...fake,
    clock,
    recordEntry: new RecordEntry(fake.tx, clock),
    recordRepayment: new RecordRepayment(fake.tx, clock),
    markNoSpend: new MarkNoSpendDay(fake.tx, clock),
  };
}

describe("RecordEntry", () => {
  it("first log of the day: +10 XP and streak 1", async () => {
    const s = setup();
    const out = await s.recordEntry.execute({ kind: "expense", total: 6000 });
    expect(out).toMatchObject({ xpGained: 10, streak: 1, leveledUp: false });
    expect(s.entries).toHaveLength(1);
  });

  it("extra entries give +1 each, capped at +5 per day", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "expense", total: 100 });
    const gains: number[] = [];
    for (let i = 0; i < 8; i++) {
      gains.push((await s.recordEntry.execute({ kind: "expense", total: 100 })).xpGained);
    }
    expect(gains).toEqual([1, 1, 1, 1, 1, 0, 0, 0]);
  });

  it("streak 10 -> first log is +15 and the streak is 10", async () => {
    const s = setup();
    for (let i = 1; i <= 9; i++) s.days.set(addDays("2026-10-03", -i), "entry");
    const out = await s.recordEntry.execute({ kind: "expense", total: 100 });
    expect(out).toMatchObject({ xpGained: 15, streak: 10 });
  });

  it("rice 100 split with แฟน records แฟน owing 50", async () => {
    const s = setup();
    const out = await s.recordEntry.execute({
      kind: "expense",
      total: 10000,
      split: { kind: "equal", people: [FAN] },
    });
    expect(out.entry.othersShare).toBe(5000);
    expect(out.entry.shares).toEqual([{ personId: FAN, amount: 5000 }]);
  });

  it("back-dated entry saves money but logs only today's press", async () => {
    const s = setup();
    const out = await s.recordEntry.execute({
      kind: "expense",
      total: 5000,
      occurredAt: new Date("2026-10-01T05:00:00Z"),
    });
    expect(out.entry.occurredAt.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect([...s.days.keys()]).toEqual(["2026-10-03"]);
  });

  it("23:59 and 00:00 Bangkok fall on different streak days", async () => {
    const s = setup(new Date("2026-10-03T16:59:00Z"));
    await s.recordEntry.execute({ kind: "expense", total: 100 });
    s.clock.current = new Date("2026-10-03T17:00:00Z");
    const out = await s.recordEntry.execute({ kind: "expense", total: 100 });
    expect([...s.days.keys()]).toEqual(["2026-10-03", "2026-10-04"]);
    expect(out).toMatchObject({ streak: 2, xpGained: 10 });
  });

  it("income cannot be fronted", async () => {
    const s = setup();
    await expect(
      s.recordEntry.execute({ kind: "income", total: 100, split: { kind: "equal", people: [FAN] } }),
    ).rejects.toMatchObject({ code: "INVALID_SPLIT" });
  });

  it("only fronts for people who are set up", async () => {
    const s = setup();
    await expect(
      s.recordEntry.execute({ kind: "expense", total: 100, split: { kind: "theirs", people: ["ghost"] } }),
    ).rejects.toMatchObject({ code: "UNKNOWN_PERSON" });
    expect(s.entries).toHaveLength(0);
  });

  it("rejects zero amounts", async () => {
    const s = setup();
    await expect(s.recordEntry.execute({ kind: "expense", total: 0 })).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("reports a level-up when XP crosses 100", async () => {
    const s = setup();
    s.xp.push({ reason: "seed", amount: 95, at: new Date("2026-09-01T00:00:00Z") });
    const out = await s.recordEntry.execute({ kind: "expense", total: 100 });
    expect(out.leveledUp).toBe(true);
  });

  it("accepts any time today but not a later day", async () => {
    const s = setup(); // 12:00 Bangkok
    const tonight = new Date("2026-10-03T16:59:00Z"); // 23:59 Bangkok, still today
    expect((await s.recordEntry.execute({ kind: "expense", total: 100, occurredAt: tonight })).entry.occurredAt).toEqual(tonight);
    await expect(
      s.recordEntry.execute({ kind: "expense", total: 100, occurredAt: new Date("2026-10-03T17:00:00Z") }),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });
  });

  it("links an entry to the preset it was logged from, and only to one of ours", async () => {
    const fake = createFakeRepos();
    const presets = { list: async () => [preset("pr-rice")] };
    const record = new RecordEntry(fake.tx, new FixedClock(NOON), presets);
    const out = await record.execute({ kind: "expense", total: 6000, source: "preset", presetId: "pr-rice" });
    expect(out.entry.presetId).toBe("pr-rice");
    await expect(record.execute({ kind: "expense", total: 6000, presetId: "pr-other" })).rejects.toMatchObject({ code: "UNKNOWN_PRESET" });
    expect(fake.entries).toHaveLength(1);
  });
});

function preset(id: string): PresetRecord {
  return { id, label: "ข้าว", icon: "restaurant", amount: 5000, categoryId: null, personId: null, splitKind: null, walletId: null, sort: 0 };
}

describe("ManagePresets.prices", () => {
  const history: PresetPrice[] = [5000, 6000, 5500, 7000, 4500].map((amount, i) => ({ amount, count: 5 - i, lastAt: NOON }));
  const repo = (seen: unknown[]): PresetRepo => ({
    list: async () => [preset("pr-rice")],
    create: async () => { throw new Error("unused"); },
    update: async () => null,
    remove: async () => false,
    prices: async (...args) => ((seen.push(...args)), history),
  });

  it("returns the four most used prices of the last 90 days", async () => {
    const seen: unknown[] = [];
    const out = await new ManagePresets(repo(seen), undefined as never).prices("pr-rice", NOON);
    expect(out?.map((p) => p.amount)).toEqual([5000, 6000, 5500, 7000]);
    expect(seen).toEqual(["pr-rice", new Date("2026-07-05T05:00:00Z")]);
  });
  it("is null for a preset that isn't ours", async () => {
    expect(await new ManagePresets(repo([]), undefined as never).prices("pr-other", NOON)).toBeNull();
  });
});

describe("RecordRepayment", () => {
  it("แฟน repays 30 of 50: 20 left, not income, no bonus", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    const out = await s.recordRepayment.execute({ personId: FAN, amount: 3000 });
    expect(out.balanceAfter).toBe(2000);
    expect(out.entry.kind).toBe("repayment");
    expect(s.xp.some((x) => x.reason === "balance_cleared")).toBe(false);
  });

  it("clearing the balance to 0 earns +20 XP", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    const out = await s.recordRepayment.execute({ personId: FAN, amount: 5000 });
    expect(out.balanceAfter).toBe(0);
    expect(s.xp.find((x) => x.reason === "balance_cleared")?.amount).toBe(20);
  });

  it("each person has their own balance: A can't repay what แฟน owes", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "expense", total: 9000, split: { kind: "equal", people: [FAN, "p-a"] } });
    const out = await s.recordRepayment.execute({ personId: "p-a", amount: 3000 });
    expect(out.balanceAfter).toBe(0);
    expect(out.entry.personId).toBe("p-a");
    await expect(s.recordRepayment.execute({ personId: "p-a", amount: 1 })).rejects.toMatchObject({
      code: "REPAYMENT_EXCEEDS_BALANCE",
    });
    expect((await s.recordRepayment.execute({ personId: FAN, amount: 1000 })).balanceAfter).toBe(2000);
  });

  it("cannot repay more than the balance", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    await expect(s.recordRepayment.execute({ personId: FAN, amount: 5001 })).rejects.toMatchObject({
      code: "REPAYMENT_EXCEEDS_BALANCE",
    });
    expect(s.entries.filter((e) => e.kind === "repayment")).toHaveLength(0);
  });
});

describe("MarkNoSpendDay", () => {
  it("counts as a logged day without creating an entry", async () => {
    const s = setup();
    const out = await s.markNoSpend.execute();
    expect(out).toMatchObject({ xpGained: 10, streak: 1 });
    expect(s.entries).toHaveLength(0);
  });

  it("is refused when today is already logged", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "expense", total: 100 });
    await expect(s.markNoSpend.execute()).rejects.toMatchObject({
      code: "NO_SPEND_ALREADY_LOGGED",
    });
  });

  it("an entry after no-spend only earns the extra-entry XP", async () => {
    const s = setup();
    await s.markNoSpend.execute();
    const out = await s.recordEntry.execute({ kind: "expense", total: 100 });
    expect(out.xpGained).toBe(1);
  });
});
