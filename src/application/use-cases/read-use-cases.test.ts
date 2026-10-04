import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT } from "@/domain/dashboard-layout";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import type { DailyTotal, StatsRepo } from "../ports";
import { GetCalendarMonth } from "./get-calendar-month";
import { GetDashboard } from "./get-dashboard";
import { GetOutstanding } from "./get-outstanding";
import { MarkNoSpendDay } from "./mark-no-spend-day";
import { RecordEntry } from "./record-entry";
import { RecordRepayment } from "./record-repayment";

const FAN = "p-fan"; // seeded by createFakeRepos

const NOON = new Date("2026-10-03T05:00:00Z");

function stats(totals: DailyTotal[] = [], kinds: { day: string; kind: "entry" | "no_spend" }[] = []): StatsRepo {
  return {
    categoryTotals: async () => [],
    dailyTotals: async (from, to) => totals.filter((t) => t.day >= from && t.day < to),
    loggedKinds: async (from, to) => kinds.filter((k) => k.day >= from && k.day < to),
  };
}

describe("GetDashboard", () => {
  it("assembles streak, level, who owes what and today's totals", async () => {
    const f = createFakeRepos();
    const clock = new FixedClock(NOON);
    await new RecordEntry(f.tx, clock).execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    await new RecordRepayment(f.tx, clock).execute({ personId: FAN, amount: 2000 });

    const view = await new GetDashboard(
      f.repos,
      stats([{ day: "2026-10-03", spent: 5000, earned: 0 }]),
      { list: async () => [], create: async () => { throw new Error(); }, update: async () => null, remove: async () => false },
      { get: async () => ({ dashboardLayout: DEFAULT_LAYOUT, meNote: "" }), update: async () => { throw new Error(); } },
      clock,
    ).execute();

    expect(view.today).toBe("2026-10-03");
    expect(view.streak).toEqual({ current: 1, loggedToday: true, atRisk: false });
    expect(view.balances).toEqual([{ personId: FAN, balance: 3000 }]);
    expect(view.people.map((p) => p.name)).toEqual(["แฟน", "A"]);
    expect(view.todayTotals).toEqual({ spent: 5000, earned: 0 });
    expect(view.xpTotal).toBe(10 + 1);
    expect(view.level.level).toBe(1);
    expect(view.recent).toHaveLength(2);
    expect(view.layout).toBe(DEFAULT_LAYOUT);
  });
});

describe("GetCalendarMonth", () => {
  it("fills every day of the month, with spend/earn and how it was logged", async () => {
    const out = await new GetCalendarMonth(
      stats(
        [
          { day: "2026-10-04", spent: 5000, earned: 1500000 },
          { day: "2026-10-10", spent: 32000, earned: 0 },
        ],
        [
          { day: "2026-10-04", kind: "entry" },
          { day: "2026-10-05", kind: "no_spend" },
        ],
      ),
    ).execute("2026-10");
    expect(out.days).toHaveLength(31);
    expect(out.days[3]).toEqual({ day: "2026-10-04", spent: 5000, earned: 1500000, logged: "entry" });
    expect(out.days[4]).toEqual({ day: "2026-10-05", spent: 0, earned: 0, logged: "no_spend" });
    expect(out.days[0].logged).toBeNull();
    expect(out.totals).toEqual({ spent: 37000, earned: 1500000, net: 1463000 });
    expect(out.maxSpent).toBe(32000);
  });
  it("handles February and rejects bad months", async () => {
    expect((await new GetCalendarMonth(stats()).execute("2028-02")).days).toHaveLength(29);
    await expect(new GetCalendarMonth(stats()).execute("2026-13")).rejects.toThrow();
  });
});

describe("GetOutstanding", () => {
  it("applies repayments to the oldest fronted expenses first", async () => {
    const f = createFakeRepos();
    const clock = new FixedClock(new Date("2026-10-01T05:00:00Z"));
    const rec = new RecordEntry(f.tx, clock);
    const a = await rec.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] }, occurredAt: new Date("2026-10-01T05:00:00Z") });
    const b = await rec.execute({ kind: "expense", total: 10000, split: { kind: "theirs", people: [FAN] }, occurredAt: new Date("2026-10-02T05:00:00Z") });
    await new RecordRepayment(f.tx, clock).execute({ personId: FAN, amount: 6000 });
    const [out, ...others] = await new GetOutstanding(f.repos).execute();
    expect(others).toEqual([]);
    expect(out.personId).toBe(FAN);
    expect(out.balance).toBe(9000);
    expect(out.items.map((i) => [i.entryId, i.outstanding])).toEqual([[b.entry.id, 9000]]);
    expect(a.entry.id).not.toBe(b.entry.id);
  });
});

describe("no-spend day shows in the calendar's logged kinds source", () => {
  it("MarkNoSpendDay logs the day without entries", async () => {
    const f = createFakeRepos();
    await new MarkNoSpendDay(f.tx, new FixedClock(NOON)).execute();
    expect(f.days.get("2026-10-03")).toBe("no_spend");
  });
});
