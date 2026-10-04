import { describe, expect, it } from "vitest";
import { FixedClock } from "../testing/fakes";
import type { LoginAttemptRepo } from "../ports";
import { spendAiBudget } from "../ai-budget";
import { GetAiBudget } from "./get-ai-budget";

const NOW = new Date("2026-10-03T05:00:00Z");

/** An attempt log that remembers per key, like the real table. */
function log(): LoginAttemptRepo {
  const rows: { key: string; at: Date }[] = [];
  return {
    async countSince(key, since) {
      return rows.filter((r) => r.key === key && r.at >= since).length;
    },
    async record(key, at) {
      rows.push({ key, at });
    },
    async clear() {},
  };
}

describe("GetAiBudget", () => {
  it("reports what is left, and follows the same counter the AI features spend from", async () => {
    const attempts = log();
    const clock = new FixedClock(NOW);
    const limit = { key: "ai:u1", perDay: 5 };
    const status = new GetAiBudget(attempts, clock, limit);
    expect(await status.execute()).toEqual({ used: 0, limit: 5, remaining: 5 });
    await spendAiBudget(attempts, clock, limit);
    await spendAiBudget(attempts, clock, limit);
    expect(await status.execute()).toEqual({ used: 2, limit: 5, remaining: 3 });
  });

  it("only counts the last 24 hours and only this account", async () => {
    const attempts = log();
    await attempts.record("ai:u1", new Date(NOW.getTime() - 25 * 3600_000)); // too old
    await attempts.record("ai:u1", new Date(NOW.getTime() - 3600_000));
    await attempts.record("ai:u2", NOW); // someone else
    expect(await new GetAiBudget(attempts, new FixedClock(NOW), { key: "ai:u1", perDay: 5 }).execute()).toEqual({
      used: 1, limit: 5, remaining: 4,
    });
  });

  it("never goes below zero, and no limit means no remaining", async () => {
    const attempts = log();
    for (let i = 0; i < 3; i++) await attempts.record("ai:u1", NOW);
    const clock = new FixedClock(NOW);
    expect((await new GetAiBudget(attempts, clock, { key: "ai:u1", perDay: 2 }).execute()).remaining).toBe(0);
    expect(await new GetAiBudget(attempts, clock, { key: "ai:u1", perDay: null }).execute()).toEqual({ used: 3, limit: null, remaining: null });
  });
});
