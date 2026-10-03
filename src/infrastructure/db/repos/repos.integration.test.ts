import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Sequelize } from "sequelize";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MarkNoSpendDay } from "@/application/use-cases/mark-no-spend-day";
import { DeleteEntry, UpdateEntry } from "@/application/use-cases/change-entry";
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
  container = await new PostgreSqlContainer(process.env.TEST_PG_IMAGE ?? "postgres:17-alpine").start();
  sequelize = createSequelize(container.getConnectionUri());
  await createMigrator(sequelize).up();
}, 120_000);

afterAll(async () => {
  await sequelize?.close();
  await container?.stop();
});

let FAN: string;
let A: string;

beforeEach(async () => {
  await sequelize.query("TRUNCATE entries, logged_days, xp_events, owner_memory, people RESTART IDENTITY CASCADE");
  const people = createRepos(sequelize).people;
  FAN = (await people.create({ name: "แฟน", note: "ชอบนมเปรี้ยว", sort: 0 })).id;
  A = (await people.create({ name: "A", note: "", sort: 1 })).id;
});

const equalWith = (...people: string[]) => ({ kind: "equal" as const, people });
const ME = { me: true, people: [] as string[] };

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
    const out = await u.recordEntry.execute({ kind: "expense", total: 8450, split: equalWith(FAN) });
    const [row] = await u.repos.entries.recent(1);
    expect(row).toMatchObject({ id: out.entry.id, total: 8450, othersShare: 4225, kind: "expense" });
    expect(row.shares).toEqual([{ personId: FAN, amount: 4225 }]);
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

  it("ledger per person: repay 30 of 50 leaves 20; over-repay is rejected and rolled back", async () => {
    const u = useCases();
    await u.recordEntry.execute({ kind: "expense", total: 9000, split: equalWith(FAN, A) });
    expect((await u.recordRepayment.execute({ personId: FAN, amount: 2000 })).balanceAfter).toBe(1000);
    await expect(u.recordRepayment.execute({ personId: FAN, amount: 1001 })).rejects.toMatchObject({
      code: "REPAYMENT_EXCEEDS_BALANCE",
    });
    const ledger = await u.repos.entries.ledger();
    expect(ledger.repayments).toEqual([{ personId: FAN, total: 2000 }]);
    expect(ledger.shares.map((x) => [x.personId, x.amount]).sort()).toEqual([[A, 3000], [FAN, 3000]].sort());
    expect(ledger.shares[0].occurredAt).toBeInstanceOf(Date);
  });

  it("an unknown person is refused before anything is written", async () => {
    const u = useCases();
    await expect(
      u.recordEntry.execute({ kind: "expense", total: 100, split: equalWith("00000000-0000-4000-8000-000000000000") }),
    ).rejects.toMatchObject({ code: "UNKNOWN_PERSON" });
    expect(await u.repos.entries.recent(5)).toHaveLength(0);
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
          shares: [],
          personId: null,
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

  it("database refuses others' share above the total, and a repayment without a person", async () => {
    await expect(
      sequelize.query(
        `INSERT INTO entries (kind, occurred_at, total, others_share)
         VALUES ('expense', now(), 100, 101)`,
      ),
    ).rejects.toThrow();
    await expect(
      sequelize.query(`INSERT INTO entries (kind, occurred_at, total) VALUES ('repayment', now(), 100)`),
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
  const mk = (kind: "expense" | "income", at: string, total: number, fanShare = 0) =>
    createRepos(sequelize).entries.insert({
      kind,
      occurredAt: new Date(at),
      createdAt: new Date(at),
      total,
      shares: fanShare ? [{ personId: FAN, amount: fanShare }] : [],
      personId: null,
      categoryId: null,
      note: null,
      merchant: null,
      source: "manual",
    });

  it("groups by Bangkok day, excludes others' shares, ignores repayments", async () => {
    await mk("expense", "2026-10-03T16:59:00Z", 10000, 5000); // Oct 3 23:59 BKK
    await mk("expense", "2026-10-03T17:00:00Z", 2000); //        Oct 4 00:00 BKK
    await mk("income", "2026-10-04T05:00:00Z", 1500000);
    await createRepos(sequelize).entries.insert({
      kind: "repayment", occurredAt: new Date("2026-10-04T06:00:00Z"), createdAt: new Date("2026-10-04T06:00:00Z"),
      total: 500, shares: [], personId: FAN, categoryId: null, note: null, merchant: null, source: "wheel",
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
    const p = await repo.create({ label: "BTS", icon: "train", amount: 4700, categoryId: null, personId: null, splitKind: null, sort: 0 });
    expect((await repo.update(p.id, { amount: 5000 }))?.amount).toBe(5000);
    const fronted = await repo.create({ label: "ข้าว", icon: "restaurant", amount: 6000, categoryId: null, personId: FAN, splitKind: "equal", sort: 1 });
    expect(fronted).toMatchObject({ personId: FAN, splitKind: "equal" });
    await repo.remove(fronted.id);
    expect(await repo.remove(p.id)).toBe(true);
    expect(await repo.remove(p.id)).toBe(false);
  });
  it("settings: defaults to a normalised layout and persists changes", async () => {
    const repo = createSettingsRepo(sequelize);
    const first = await repo.get();
    expect(first.dashboardLayout.map((i) => i.id)).toContain("calendar");
    await repo.update({ dashboardLayout: [{ id: "calendar", enabled: true }] });
    expect((await repo.get()).dashboardLayout[0]).toEqual({ id: "calendar", enabled: true });
  });
  it("people: listed in order, edited and archived", async () => {
    const repo = createRepos(sequelize).people;
    expect((await repo.list()).map((p) => p.name)).toEqual(["แฟน", "A"]);
    expect(await repo.update(A, { name: "แม่", archived: true })).toMatchObject({ name: "แม่", archived: true });
    expect(await repo.update("00000000-0000-4000-8000-000000000000", { name: "x" })).toBeNull();
  });
});

describe("receipt save against real Postgres", () => {
  const lines = () => [
    { rawName: "ข้าวปั้น", canonicalName: "ข้าวปั้น", qty: 1, price: 3500, owners: ME },
    { rawName: "DUTCHMILL", canonicalName: "นมเปรี้ยว", qty: 2, price: 1500, owners: { me: false, people: [FAN] } },
    { rawName: "แชมพู", canonicalName: "แชมพู", qty: 1, price: 8900, owners: { me: true, people: [FAN, A] } },
  ];

  it("stores one entry with allocated lines and each person's share", async () => {
    const tx = createTransactionRunner(sequelize);
    const out = await new SaveReceiptEntry(tx, new FixedClock(NOON)).execute({ merchant: "7-Eleven", total: 13000, lines: lines() });
    const [[{ n, sum }]] = (await sequelize.query(
      `SELECT count(*)::int AS n, sum(price)::int AS sum FROM receipt_lines WHERE entry_id = '${out.entry.id}'`,
    )) as [{ n: number; sum: number }[], unknown];
    expect(n).toBe(3);
    expect(sum).toBe(13000); // 13900 printed, 13000 paid: lines were scaled to the paid total
    expect(out.entry).toMatchObject({ kind: "expense", source: "receipt", merchant: "7-Eleven" });
    const stored = await createRepos(sequelize).entries.findById(out.entry.id);
    expect(stored?.shares.map((s) => s.personId).sort()).toEqual([A, FAN].sort());
    expect(stored?.othersShare).toBe(out.entry.othersShare);
  });

  it("upserts owner memory and a later choice overwrites the earlier one", async () => {
    const tx = createTransactionRunner(sequelize);
    const uc = new SaveReceiptEntry(tx, new FixedClock(NOON));
    await uc.execute({ total: 13900, lines: lines() });
    await uc.execute({ total: 1500, people: [FAN], lines: [{ rawName: "DUTCHMILL", canonicalName: "นมเปรี้ยว", qty: 1, price: 1500, owners: ME }] });
    const mem = await createRepos(sequelize).ownerMemory.all();
    expect(mem.get("นมเปรี้ยว")).toEqual(ME);
    expect(mem.get("แชมพู")).toEqual({ me: true, people: [FAN, A] });
  });

  it("deleting the entry removes its lines and shares", async () => {
    const tx = createTransactionRunner(sequelize);
    const out = await new SaveReceiptEntry(tx, new FixedClock(NOON)).execute({ total: 13900, lines: lines() });
    await sequelize.query(`DELETE FROM entries WHERE id = '${out.entry.id}'`);
    const [rows] = await sequelize.query(`SELECT 1 FROM receipt_lines WHERE entry_id = '${out.entry.id}'`);
    const [shares] = await sequelize.query(`SELECT 1 FROM entry_shares WHERE entry_id = '${out.entry.id}'`);
    expect(rows).toHaveLength(0);
    expect(shares).toHaveLength(0);
  });

  it("rolls back the entry when a line violates a constraint", async () => {
    const tx = createTransactionRunner(sequelize);
    const bad = new SaveReceiptEntry(tx, new FixedClock(NOON));
    await expect(bad.execute({ total: 100, lines: [{ ...lines()[0], qty: 1.5 }] })).rejects.toThrow();
    expect(await createRepos(sequelize).entries.recent(5)).toHaveLength(0);
  });
});

describe("changing entries rolls back for real", () => {
  it("a delete that would drive a balance negative leaves the row in place", async () => {
    const u = useCases();
    const { entry } = await u.recordEntry.execute({ kind: "expense", total: 10000, split: equalWith(FAN) });
    await u.recordRepayment.execute({ personId: FAN, amount: 5000 });
    await expect(new DeleteEntry(createTransactionRunner(sequelize)).execute(entry.id)).rejects.toMatchObject({
      code: "BALANCE_WOULD_GO_NEGATIVE",
    });
    expect(await u.repos.entries.findById(entry.id)).not.toBeNull();
  });

  it("an edit that would drive it negative keeps the old values", async () => {
    const u = useCases();
    const { entry } = await u.recordEntry.execute({ kind: "expense", total: 10000, split: equalWith(FAN) });
    await u.recordRepayment.execute({ personId: FAN, amount: 4000 });
    await expect(
      new UpdateEntry(createTransactionRunner(sequelize)).execute(entry.id, { split: { kind: "none" } }),
    ).rejects.toMatchObject({ code: "BALANCE_WOULD_GO_NEGATIVE" });
    const kept = await u.repos.entries.findById(entry.id);
    expect(kept?.othersShare).toBe(5000);
    expect(kept?.shares).toEqual([{ personId: FAN, amount: 5000 }]);
  });

  it("re-splitting replaces the shares", async () => {
    const u = useCases();
    const { entry } = await u.recordEntry.execute({ kind: "expense", total: 9000, split: equalWith(FAN) });
    const out = await new UpdateEntry(createTransactionRunner(sequelize)).execute(entry.id, { split: equalWith(FAN, A) });
    expect(out.othersShare).toBe(6000);
    const stored = await u.repos.entries.findById(entry.id);
    expect(stored?.shares.map((s) => s.amount)).toEqual([3000, 3000]);
    expect(stored?.othersShare).toBe(6000);
  });
});

describe("model registration is minifier-proof", () => {
  it("every model has an explicit name and no association accessor is called plain 'set'", async () => {
    const { initModels } = await import("../models");
    const models = initModels(sequelize);
    for (const [expected, model] of Object.entries(models)) {
      // production builds mangle class names; Sequelize derives accessors from this name
      expect(model.name).toBe(expected);
      for (const assoc of Object.values(model.associations) as { accessors: Record<string, string> }[]) {
        expect(assoc.accessors).toBeDefined();
        const names = Object.values(assoc.accessors);
        expect(names).not.toContain("set"); // that spelling overwrites Model#set and recurses forever
      }
    }
  });
});

describe("itemized groups", () => {
  it("the database accepts the itemized source", async () => {
    const u = useCases();
    const out = await new SaveReceiptEntry(createTransactionRunner(sequelize), u.clock).execute({
      source: "itemized",
      total: 3000,
      lines: [{ rawName: "ไข่", canonicalName: "ไข่", qty: 1, price: 3000, owners: { me: true, people: [FAN] } }],
    });
    const [row] = await u.repos.entries.recent(1);
    expect(row).toMatchObject({ id: out.entry.id, source: "itemized", othersShare: 1500 });
  });
});

describe("category totals", () => {
  it("counts our share per category, groups by their lines (once), and ignores income and repayments", async () => {
    const u = useCases();
    const tx = createTransactionRunner(sequelize);
    const [food, ride] = (await createCategoryRepo(sequelize).list()).filter((c) => c.kind === "expense");
    await u.recordEntry.execute({ kind: "expense", total: 10000, categoryId: food.id, split: equalWith(FAN) }); // ours 5000
    await u.recordEntry.execute({ kind: "expense", total: 3000, categoryId: ride.id });
    await u.recordEntry.execute({ kind: "income", total: 99999 });
    await new SaveReceiptEntry(tx, u.clock).execute({
      total: 2001,
      lines: [
        { rawName: "a", canonicalName: "a", qty: 1, price: 1001, owners: { me: true, people: [FAN] }, categoryId: food.id }, // ours 501
        { rawName: "b", canonicalName: "b", qty: 1, price: 1000, owners: { me: false, people: [FAN] }, categoryId: food.id }, // ours 0
      ],
    });
    await new SaveReceiptEntry(tx, u.clock).execute({
      source: "itemized",
      total: 1000,
      lines: [{ rawName: "c", canonicalName: "c", qty: 1, price: 1000, owners: { me: true, people: [FAN, A] }, categoryId: ride.id }], // ours 334
    });
    const totals = await createStatsRepo(sequelize).categoryTotals("2026-10-01", "2026-11-01");
    expect(totals).toEqual([
      { categoryId: food.id, spent: 5501 },
      { categoryId: ride.id, spent: 3334 },
    ]);
  });
});

describe("migration 004: the old single partner becomes a person", () => {
  it("moves shares, repayments, lines, memory, presets and the note to a person called แฟน", async () => {
    await sequelize.query("DROP DATABASE IF EXISTS legacy");
    await sequelize.query("CREATE DATABASE legacy");
    const legacy = createSequelize(container.getConnectionUri().replace(/\/[^/]+$/, "/legacy"));
    try {
      const migrator = createMigrator(legacy);
      await migrator.up({ to: "003-itemized-source" });
      await legacy.query(`
        UPDATE settings SET partner_note = 'ชอบนมเปรี้ยว',
          dashboard_layout = '[{"id":"streak","enabled":true},{"id":"partner","enabled":false}]';
        INSERT INTO entries (id, kind, occurred_at, total, partner_share) VALUES
          ('11111111-1111-4111-8111-111111111111', 'expense', now(), 10000, 5000),
          ('22222222-2222-4222-8222-222222222222', 'expense', now(), 3000, 0);
        INSERT INTO entries (kind, occurred_at, total, source) VALUES ('repayment', now(), 2000, 'wheel');
        INSERT INTO receipt_lines (entry_id, raw_name, canonical_name, price, owner) VALUES
          ('11111111-1111-4111-8111-111111111111', 'a', 'a', 4000, 'partner'),
          ('11111111-1111-4111-8111-111111111111', 'b', 'b', 2000, 'split'),
          ('11111111-1111-4111-8111-111111111111', 'c', 'c', 4000, 'me');
        INSERT INTO owner_memory (canonical_name, owner) VALUES ('a', 'partner'), ('b', 'split'), ('c', 'me');
        INSERT INTO presets (label, icon, amount, partner_mode) VALUES ('ข้าว', 'restaurant', 6000, 'split'), ('BTS', 'train', 4700, NULL);
      `);
      await migrator.up();

      const repos = createRepos(legacy);
      const [fan] = await repos.people.list();
      expect(fan).toMatchObject({ name: "แฟน", note: "ชอบนมเปรี้ยว" });
      const ledger = await repos.entries.ledger();
      expect(ledger.shares.map((s) => [s.personId, s.amount])).toEqual([[fan.id, 5000]]);
      expect(ledger.repayments).toEqual([{ personId: fan.id, total: 2000 }]);
      expect((await repos.entries.findById("11111111-1111-4111-8111-111111111111"))?.othersShare).toBe(5000);

      const [lines] = (await legacy.query(
        "SELECT canonical_name, includes_me, people FROM receipt_lines ORDER BY canonical_name",
      )) as [{ canonical_name: string; includes_me: boolean; people: string[] }[], unknown];
      expect(lines.map((l) => [l.canonical_name, l.includes_me, l.people])).toEqual([
        ["a", false, [fan.id]],
        ["b", true, [fan.id]],
        ["c", true, []],
      ]);
      const mem = await repos.ownerMemory.all();
      expect(mem.get("a")).toEqual({ me: false, people: [fan.id] });
      expect(mem.get("b")).toEqual({ me: true, people: [fan.id] });
      expect(mem.get("c")).toEqual({ me: true, people: [] });

      const presets = await createPresetRepo(legacy).list();
      expect(presets.map((p) => [p.label, p.personId, p.splitKind])).toEqual([
        ["BTS", null, null],
        ["ข้าว", fan.id, "equal"],
      ]);
      expect((await createSettingsRepo(legacy).get()).dashboardLayout.slice(0, 2)).toEqual([
        { id: "streak", enabled: true },
        { id: "people", enabled: false },
      ]);

      await migrator.down({ to: "004-people" }); // and back: still one partner with the same balance
      const [[back]] = (await legacy.query(
        "SELECT partner_share FROM entries WHERE id = '11111111-1111-4111-8111-111111111111'",
      )) as [{ partner_share: number }[], unknown];
      expect(back.partner_share).toBe(5000);
    } finally {
      await legacy.close();
      await sequelize.query("DROP DATABASE IF EXISTS legacy");
    }
  });
});
