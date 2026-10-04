import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { createFakeSummaryRepo, FixedClock } from "../testing/fakes";
import type { CategoryRecord, LoginAttemptRepo, MonthFacts, MonthSummarizer, StatsRepo } from "../ports";
import { EMPTY_MONTH_TEXT, GetMonthSummary } from "./get-month-summary";

const cats: CategoryRecord[] = [
  { id: "food", name: "อาหาร", icon: "restaurant", kind: "expense", sort: 0, archived: false },
  { id: "taxi", name: "เดินทาง", icon: "local_taxi", kind: "expense", sort: 1, archived: false },
];

/** Category totals keyed by their date range, so a test can tell which span the use case asked for. */
function stats(byRange: Record<string, { categoryId: string | null; spent: number }[]>, logged = []): StatsRepo {
  return {
    async dailyTotals() {
      throw new Error("not used");
    },
    async loggedKinds() {
      return logged;
    },
    async categoryTotals(from, to) {
      return byRange[`${from}..${to}`] ?? [];
    },
  };
}

function budget(): LoginAttemptRepo & { n: number; keys: string[] } {
  const log: Date[] = [];
  const keys: string[] = [];
  return {
    get n() {
      return log.length;
    },
    keys,
    async countSince(k, since) {
      keys.push(k);
      return log.filter((d) => d >= since).length;
    },
    async record(k, at) {
      keys.push(k);
      log.push(at);
    },
    async clear() {},
  };
}

function summarizer(fail = false): MonthSummarizer & { seen: MonthFacts[] } {
  const seen: MonthFacts[] = [];
  return {
    seen,
    async summarize(f) {
      seen.push(f);
      if (fail) throw new DomainError("AI_UNAVAILABLE");
      return `สรุป ${seen.length}`;
    },
  };
}

const NOW = new Date("2026-10-15T05:00:00Z"); // 15 Oct, Bangkok
const LATER_SAME_DAY = new Date("2026-10-15T14:00:00Z");
const NEXT_DAY = new Date("2026-10-16T05:00:00Z");

// October so far (1-15) vs September over the same 15 days; September in full (1-30) vs August in full.
const RANGES = {
  "2026-10-01..2026-10-16": [{ categoryId: "food", spent: 120000 }, { categoryId: null, spent: 30000 }],
  "2026-09-01..2026-09-16": [{ categoryId: "food", spent: 100000 }, { categoryId: "taxi", spent: 50000 }],
  "2026-10-01..2026-10-17": [{ categoryId: "food", spent: 130000 }], // a day later
  "2026-09-01..2026-09-17": [{ categoryId: "food", spent: 110000 }],
  "2026-09-01..2026-10-01":[{ categoryId: "food", spent: 300000 }],
  "2026-08-01..2026-09-01": [{ categoryId: "food", spent: 200000 }],
};

function setup(opts: { limit?: number | null; fail?: boolean; now?: Date } = {}) {
  const clock = new FixedClock(opts.now ?? NOW);
  const ai = summarizer(opts.fail);
  const b = budget();
  const repo = createFakeSummaryRepo();
  const uc = new GetMonthSummary(
    stats(RANGES, [{ day: "2026-10-01", kind: "entry" }, { day: "2026-10-02", kind: "no_spend" }] as never),
    { list: async () => cats, create: undefined as never, update: undefined as never },
    repo,
    ai,
    b,
    clock,
    { key: "ai:u1", perDay: opts.limit === undefined ? 5 : opts.limit },
  );
  return { uc, ai, b, repo, clock };
}

describe("GetMonthSummary", () => {
  it("sends the model only aggregates, with the percentages worked out in code", async () => {
    const { uc, ai } = setup();
    await uc.execute("2026-10");
    // The whole payload, exactly: no entries, notes, merchants or people can be in it.
    expect(ai.seen).toEqual([
      {
        month: "2026-10",
        daysCovered: 15,
        loggedDays: 2,
        noSpendDays: 1,
        spent: 150000,
        prevSpent: 150000,
        changePct: 0,
        categories: [
          { name: "อาหาร", spent: 120000, prevSpent: 100000, changePct: 20, sharePct: 80 },
          { name: "ไม่ระบุหมวด", spent: 30000, prevSpent: 0, changePct: null, sharePct: 20 },
        ],
      },
    ]);
    expect(Object.keys(ai.seen[0]).sort()).toEqual(
      ["categories", "changePct", "daysCovered", "loggedDays", "month", "noSpendDays", "prevSpent", "spent"],
    );
  });

  it("a miss makes one AI call, counts it under the shared key and stores the text", async () => {
    const { uc, ai, b, repo } = setup();
    const out = await uc.execute("2026-10");
    expect(out).toMatchObject({ month: "2026-10", text: "สรุป 1", generatedAt: NOW });
    expect(ai.seen).toHaveLength(1);
    expect(b.n).toBe(1);
    expect(new Set(b.keys)).toEqual(new Set(["ai:u1"]));
    expect(repo.rows.get("2026-10")).toMatchObject({ text: "สรุป 1", createdAt: NOW });
  });

  it("a cache hit makes no AI call and uses no budget", async () => {
    const { uc, ai, b } = setup();
    await uc.execute("2026-10");
    const again = await uc.execute("2026-10");
    expect(again.text).toBe("สรุป 1");
    expect(ai.seen).toHaveLength(1);
    expect(b.n).toBe(1);
  });

  it("the current month is regenerated on a later day, not later the same day", async () => {
    const { uc, ai, clock } = setup();
    await uc.execute("2026-10");
    clock.current = LATER_SAME_DAY;
    expect((await uc.execute("2026-10")).text).toBe("สรุป 1");
    clock.current = NEXT_DAY;
    expect((await uc.execute("2026-10")).text).toBe("สรุป 2");
    expect(ai.seen).toHaveLength(2);
  });

  it("a finished month is written once and never regenerated, however old", async () => {
    const { uc, ai, b, clock } = setup();
    expect((await uc.execute("2026-09")).text).toBe("สรุป 1");
    // September is compared in full with August
    expect(ai.seen[0]).toMatchObject({ daysCovered: 30, spent: 300000, prevSpent: 200000, changePct: 50 });
    clock.current = new Date("2027-03-01T05:00:00Z");
    expect((await uc.execute("2026-09")).text).toBe("สรุป 1");
    expect(ai.seen).toHaveLength(1);
    expect(b.n).toBe(1);
  });

  it("a failed AI call still counts and stores nothing", async () => {
    const { uc, b, repo } = setup({ fail: true });
    await expect(uc.execute("2026-10")).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(b.n).toBe(1);
    expect(repo.rows.size).toBe(0);
  });

  it("refuses with RATE_LIMITED over the daily limit, without calling the AI", async () => {
    const { uc, ai, b } = setup({ limit: 1 });
    await uc.execute("2026-10");
    await expect(uc.execute("2026-09")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(ai.seen).toHaveLength(1);
    expect(b.n).toBe(1);
  });

  it("a limit of null counts but never blocks", async () => {
    const { uc, b } = setup({ limit: null });
    await uc.execute("2026-10");
    await uc.execute("2026-09");
    expect(b.n).toBe(2);
  });

  it("a cached summary is still served when the budget is used up", async () => {
    const { uc } = setup({ limit: 1 });
    await uc.execute("2026-10");
    expect((await uc.execute("2026-10")).text).toBe("สรุป 1");
  });

  it("a month with no spending gets the fixed message with no AI call, no budget and nothing stored", async () => {
    const { uc, ai, b, repo } = setup();
    const out = await uc.execute("2026-07"); // no totals for July
    expect(out).toEqual({ month: "2026-07", text: EMPTY_MONTH_TEXT, generatedAt: null });
    expect(ai.seen).toHaveLength(0);
    expect(b.n).toBe(0);
    expect(repo.rows.size).toBe(0);
  });

  it("a future month is empty too", async () => {
    const { uc, ai } = setup();
    expect((await uc.execute("2026-12")).text).toBe(EMPTY_MONTH_TEXT);
    expect(ai.seen).toHaveLength(0);
  });
});
