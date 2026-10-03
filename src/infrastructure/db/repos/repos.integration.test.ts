import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Sequelize } from "sequelize";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MarkNoSpendDay } from "@/application/use-cases/mark-no-spend-day";
import { RecordEntry } from "@/application/use-cases/record-entry";
import { RecordRepayment } from "@/application/use-cases/record-repayment";
import { FixedClock } from "@/application/testing/fakes";
import { createMigrator } from "../migrate";
import { createSequelize } from "../sequelize";
import { createRepos, createTransactionRunner } from "./index";
import { createLoginAttemptRepo } from "./login-attempt-repo";

let container: StartedPostgreSqlContainer;
let sequelize: Sequelize;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  sequelize = createSequelize(container.getConnectionUri());
  await createMigrator(sequelize).up();
}, 120_000);

afterAll(async () => {
  await sequelize?.close();
  await container?.stop();
});

beforeEach(async () => {
  await sequelize.query("TRUNCATE entries, logged_days, xp_events RESTART IDENTITY CASCADE");
});

const NOON = new Date("2026-10-03T05:00:00Z"); // 12:00 Bangkok

function useCases(now = NOON) {
  const tx = createTransactionRunner(sequelize);
  const clock = new FixedClock(now);
  return {
    clock,
    recordEntry: new RecordEntry(tx, clock),
    recordRepayment: new RecordRepayment(tx, clock),
    markNoSpend: new MarkNoSpendDay(tx, clock),
    repos: createRepos(sequelize),
  };
}

describe("Sequelize repos against real Postgres", () => {
  it("stores money as integer satang and round-trips it", async () => {
    const u = useCases();
    const out = await u.recordEntry.execute({ kind: "expense", total: 8450, split: { kind: "split" } });
    const [row] = await u.repos.entries.recent(1);
    expect(row).toMatchObject({ id: out.entry.id, total: 8450, partnerShare: 4225, kind: "expense" });
    expect(row.occurredAt).toBeInstanceOf(Date);
  });

  it("first entry of the day logs a Bangkok day, XP and streak", async () => {
    const u = useCases();
    const out = await u.recordEntry.execute({ kind: "expense", total: 6000 });
    expect(out).toMatchObject({ xpGained: 10, streak: 1 });
    expect(await u.repos.loggedDays.allDays()).toEqual(["2026-10-03"]);
    expect(await u.repos.xp.total()).toBe(10);
  });

  it("a press at 17:00Z is already tomorrow in Bangkok", async () => {
    const u = useCases(new Date("2026-10-03T17:00:00Z"));
    await u.recordEntry.execute({ kind: "expense", total: 100 });
    expect(await u.repos.loggedDays.allDays()).toEqual(["2026-10-04"]);
  });

  it("extra-entry XP caps at 5 per Bangkok day", async () => {
    const u = useCases();
    await u.recordEntry.execute({ kind: "expense", total: 100 });
    for (let i = 0; i < 8; i++) await u.recordEntry.execute({ kind: "expense", total: 100 });
    expect(await u.repos.xp.extraEntryXpOnDay("2026-10-03")).toBe(5);
    expect(await u.repos.xp.total()).toBe(15);
  });

  it("partner ledger: repay 30 of 50 leaves 20; over-repay is rejected and rolled back", async () => {
    const u = useCases();
    await u.recordEntry.execute({ kind: "expense", total: 10000, split: { kind: "split" } });
    expect((await u.recordRepayment.execute({ amount: 3000 })).balanceAfter).toBe(2000);
    await expect(u.recordRepayment.execute({ amount: 2001 })).rejects.toMatchObject({
      code: "REPAYMENT_EXCEEDS_BALANCE",
    });
    const { repayments } = await u.repos.entries.partnerLedger();
    expect(repayments).toEqual([{ total: 3000 }]);
  });

  it("rolls the whole use case back when a later step fails", async () => {
    const tx = createTransactionRunner(sequelize);
    await expect(
      tx.run(async (repos) => {
        await repos.entries.insert({
          kind: "expense",
          occurredAt: NOON,
          createdAt: NOON,
          total: 100,
          partnerShare: 0,
          categoryId: null,
          note: null,
          merchant: null,
          source: "manual",
        });
        await repos.xp.add("first_log", 0, NOON); // violates CHECK (amount > 0)
      }),
    ).rejects.toThrow();
    expect(await createRepos(sequelize).entries.recent(10)).toHaveLength(0);
  });

  it("database refuses a partner share above the total", async () => {
    await expect(
      sequelize.query(
        `INSERT INTO entries (kind, occurred_at, total, partner_share)
         VALUES ('expense', now(), 100, 101)`,
      ),
    ).rejects.toThrow();
  });

  it("no-spend day, then a second one is refused", async () => {
    const u = useCases();
    expect(await u.markNoSpend.execute()).toMatchObject({ xpGained: 10, streak: 1 });
    await expect(u.markNoSpend.execute()).rejects.toMatchObject({ code: "NO_SPEND_ALREADY_LOGGED" });
  });
});

describe("login attempt repo", () => {
  it("counts failures per key inside the window and clears them", async () => {
    await sequelize.query("TRUNCATE login_attempts");
    const repo = createLoginAttemptRepo(sequelize);
    const t0 = new Date("2026-10-03T05:00:00Z");
    await repo.record("email:a@x.com", t0);
    await repo.record("email:a@x.com", new Date(t0.getTime() + 1000));
    await repo.record("ip:1.1.1.1", t0);
    expect(await repo.countSince("email:a@x.com", new Date(t0.getTime() - 1000))).toBe(2);
    expect(await repo.countSince("email:a@x.com", new Date(t0.getTime() + 500))).toBe(1);
    expect(await repo.countSince("ip:1.1.1.1", new Date(t0.getTime() - 1000))).toBe(1);
    await repo.clear("email:a@x.com");
    expect(await repo.countSince("email:a@x.com", new Date(t0.getTime() - 1000))).toBe(0);
    expect(await repo.countSince("ip:1.1.1.1", new Date(t0.getTime() - 1000))).toBe(1);
  });
});
