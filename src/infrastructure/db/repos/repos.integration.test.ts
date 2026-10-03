import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Sequelize } from "sequelize";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MarkNoSpendDay } from "@/application/use-cases/mark-no-spend-day";
import { RecordEntry } from "@/application/use-cases/record-entry";
import { SaveReceiptEntry } from "@/application/use-cases/save-receipt-entry";
import { RecordRepayment } from "@/application/use-cases/record-repayment";
import { FixedClock } from "@/application/testing/fakes";
import { createMigrator } from "../migrate";
import { createSequelize } from "../sequelize";
import { createRepos, createTransactionRunner } from "./index";
import { createLoginAttemptRepo } from "./login-attempt-repo";
import { createCategoryRepo, createPresetRepo, createSettingsRepo, createStatsRepo } from "./read-repos";

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
  await sequelize.query("TRUNCATE entries, logged_days, xp_events, owner_memory RESTART IDENTITY CASCADE");
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

describe("stats (raw SQL) at the Bangkok midnight boundary", () => {
  const mk = (kind: "expense" | "income", at: string, total: number, partnerShare = 0) =>
    createRepos(sequelize).entries.insert({
      kind,
      occurredAt: new Date(at),
      createdAt: new Date(at),
      total,
      partnerShare,
      categoryId: null,
      note: null,
      merchant: null,
      source: "manual",
    });

  it("groups by Bangkok day, excludes the partner share, ignores repayments", async () => {
    await mk("expense", "2026-10-03T16:59:00Z", 10000, 5000); // Oct 3 23:59 BKK
    await mk("expense", "2026-10-03T17:00:00Z", 2000); //        Oct 4 00:00 BKK
    await mk("income", "2026-10-04T05:00:00Z", 1500000);
    await createRepos(sequelize).entries.insert({
      kind: "repayment", occurredAt: new Date("2026-10-04T06:00:00Z"), createdAt: new Date("2026-10-04T06:00:00Z"),
      total: 500, partnerShare: 0, categoryId: null, note: null, merchant: null, source: "wheel",
    });
    const out = await createStatsRepo(sequelize).dailyTotals("2026-10-03", "2026-10-05");
    expect(out).toEqual([
      { day: "2026-10-03", spent: 5000, earned: 0 },
      { day: "2026-10-04", spent: 2000, earned: 1500000 },
    ]);
  });

  it("returns logged days with how they were logged", async () => {
    const repos = createRepos(sequelize);
    await repos.loggedDays.add("2026-10-03", "entry", NOON);
    await repos.loggedDays.add("2026-10-04", "no_spend", NOON);
    expect(await createStatsRepo(sequelize).loggedKinds("2026-10-01", "2026-11-01")).toEqual([
      { day: "2026-10-03", kind: "entry" },
      { day: "2026-10-04", kind: "no_spend" },
    ]);
  });
});

describe("categories, presets, settings", () => {
  it("has the seeded default categories with Material Symbols icons", async () => {
    const list = await createCategoryRepo(sequelize).list();
    expect(list.filter((c) => c.kind === "expense").map((c) => c.icon)).toContain("restaurant");
    expect(list.filter((c) => c.kind === "income")).toHaveLength(2);
  });
  it("creates, updates and removes presets", async () => {
    const repo = createPresetRepo(sequelize);
    const p = await repo.create({ label: "BTS", icon: "train", amount: 4700, categoryId: null, partnerMode: null, sort: 0 });
    expect((await repo.update(p.id, { amount: 5000 }))?.amount).toBe(5000);
    expect(await repo.remove(p.id)).toBe(true);
    expect(await repo.remove(p.id)).toBe(false);
  });
  it("settings: defaults to a normalised layout and persists changes", async () => {
    const repo = createSettingsRepo(sequelize);
    const first = await repo.get();
    expect(first.dashboardLayout.map((i) => i.id)).toContain("calendar");
    const next = await repo.update({ partnerNote: "ชอบนมเปรี้ยว", dashboardLayout: [{ id: "calendar", enabled: true }] });
    expect(next.partnerNote).toBe("ชอบนมเปรี้ยว");
    expect((await repo.get()).dashboardLayout[0]).toEqual({ id: "calendar", enabled: true });
  });
});

describe("receipt save against real Postgres", () => {
  const lines = [
    { rawName: "ข้าวปั้น", canonicalName: "ข้าวปั้น", qty: 1, price: 3500, owner: "me" as const },
    { rawName: "DUTCHMILL", canonicalName: "นมเปรี้ยว", qty: 2, price: 1500, owner: "partner" as const },
    { rawName: "แชมพู", canonicalName: "แชมพู", qty: 1, price: 8900, owner: "split" as const },
  ];

  it("stores one entry with allocated lines and the partner share", async () => {
    const tx = createTransactionRunner(sequelize);
    const out = await new SaveReceiptEntry(tx, new FixedClock(NOON)).execute({ merchant: "7-Eleven", total: 13000, lines });
    const [[{ n, sum }]] = (await sequelize.query(
      `SELECT count(*)::int AS n, sum(price)::int AS sum FROM receipt_lines WHERE entry_id = '${out.entry.id}'`,
    )) as [{ n: number; sum: number }[], unknown];
    expect(n).toBe(3);
    expect(sum).toBe(13000); // 13900 printed, 13000 paid: lines were scaled to the paid total
    expect(out.entry).toMatchObject({ kind: "expense", source: "receipt", merchant: "7-Eleven" });
    expect(out.entry.partnerShare).toBeGreaterThan(0);
  });

  it("upserts owner memory and a later choice overwrites the earlier one", async () => {
    const tx = createTransactionRunner(sequelize);
    const uc = new SaveReceiptEntry(tx, new FixedClock(NOON));
    await uc.execute({ total: 13900, lines });
    await uc.execute({ total: 1500, lines: [{ rawName: "DUTCHMILL", canonicalName: "นมเปรี้ยว", qty: 1, price: 1500, owner: "me" }] });
    const mem = await createRepos(sequelize).ownerMemory.all();
    expect(mem.get("นมเปรี้ยว")).toBe("me");
    expect(mem.get("แชมพู")).toBe("split");
  });

  it("deleting the entry removes its lines", async () => {
    const tx = createTransactionRunner(sequelize);
    const out = await new SaveReceiptEntry(tx, new FixedClock(NOON)).execute({ total: 13900, lines });
    await sequelize.query(`DELETE FROM entries WHERE id = '${out.entry.id}'`);
    const [rows] = await sequelize.query(`SELECT 1 FROM receipt_lines WHERE entry_id = '${out.entry.id}'`);
    expect(rows).toHaveLength(0);
  });

  it("rolls back the entry when a line violates a constraint", async () => {
    const tx = createTransactionRunner(sequelize);
    const bad = new SaveReceiptEntry(tx, new FixedClock(NOON));
    await expect(bad.execute({ total: 100, lines: [{ ...lines[0], owner: "nobody" as never }] })).rejects.toThrow();
    expect(await createRepos(sequelize).entries.recent(5)).toHaveLength(0);
  });
});
