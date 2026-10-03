import { QueryTypes, type Sequelize, type Transaction } from "sequelize";
import type { DayKey } from "@/domain/day";
import type { PartnerExpense, Repayment } from "@/domain/partner";
import type {
  EntryRecord,
  EntryRepo,
  LoggedDayRepo,
  NewEntry,
  Repos,
  TransactionRunner,
  XpRepo,
} from "@/application/ports";

interface EntryRow {
  id: string;
  kind: EntryRecord["kind"];
  occurred_at: Date;
  created_at: Date;
  total: number;
  partner_share: number;
  category_id: string | null;
  note: string | null;
  merchant: string | null;
  source: EntryRecord["source"];
}

const toEntry = (r: EntryRow): EntryRecord => ({
  id: r.id,
  kind: r.kind,
  occurredAt: r.occurred_at,
  createdAt: r.created_at,
  total: r.total,
  partnerShare: r.partner_share,
  categoryId: r.category_id,
  note: r.note,
  merchant: r.merchant,
  source: r.source,
});

/** Every repo gets the same transaction, so one use case commits or rolls back as a unit. */
export function createRepos(sequelize: Sequelize, transaction?: Transaction): Repos {
  const q = <T extends object>(sql: string, replacements: Record<string, unknown> = {}) =>
    sequelize.query<T>(sql, { replacements, transaction, type: QueryTypes.SELECT });
  const run = (sql: string, replacements: Record<string, unknown> = {}) =>
    sequelize.query(sql, { replacements, transaction });

  const entries: EntryRepo = {
    async insert(e: NewEntry) {
      const [row] = await q<EntryRow>(
        `INSERT INTO entries (kind, occurred_at, created_at, total, partner_share,
                              category_id, note, merchant, source)
         VALUES (:kind, :occurredAt, :createdAt, :total, :partnerShare,
                 :categoryId, :note, :merchant, :source)
         RETURNING *`,
        { ...e },
      );
      return toEntry(row);
    },
    async partnerLedger() {
      const expenses = await q<{ id: string; occurred_at: Date; partner_share: number }>(
        `SELECT id, occurred_at, partner_share FROM entries
         WHERE kind = 'expense' AND partner_share > 0`,
      );
      const repayments = await q<{ total: number }>(
        `SELECT total FROM entries WHERE kind = 'repayment'`,
      );
      return {
        expenses: expenses.map(
          (r): PartnerExpense => ({
            id: r.id,
            occurredAt: r.occurred_at,
            partnerShare: r.partner_share,
          }),
        ),
        repayments: repayments.map((r): Repayment => ({ total: r.total })),
      };
    },
    async recent(limit) {
      const rows = await q<EntryRow>(
        `SELECT * FROM entries ORDER BY occurred_at DESC, created_at DESC LIMIT :limit`,
        { limit },
      );
      return rows.map(toEntry);
    },
  };

  const loggedDays: LoggedDayRepo = {
    async has(day) {
      const rows = await q(`SELECT 1 FROM logged_days WHERE day = :day`, { day });
      return rows.length > 0;
    },
    async add(day, kind, at) {
      await run(
        `INSERT INTO logged_days (day, kind, first_logged_at) VALUES (:day, :kind, :at)
         ON CONFLICT (day) DO NOTHING`,
        { day, kind, at },
      );
    },
    async allDays() {
      const rows = await q<{ day: string }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM logged_days ORDER BY day`,
      );
      return rows.map((r) => r.day as DayKey);
    },
  };

  const xp: XpRepo = {
    async add(reason, amount, at) {
      await run(`INSERT INTO xp_events (reason, amount, created_at) VALUES (:reason, :amount, :at)`, {
        reason,
        amount,
        at,
      });
    },
    async total() {
      const [row] = await q<{ total: string }>(`SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events`);
      return Number(row.total);
    },
    async extraEntryXpOnDay(day) {
      const [row] = await q<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events
         WHERE reason = 'extra_entry'
           AND (created_at AT TIME ZONE 'Asia/Bangkok')::date = :day::date`,
        { day },
      );
      return Number(row.total);
    },
  };

  return { entries, loggedDays, xp };
}

export function createTransactionRunner(sequelize: Sequelize): TransactionRunner {
  return {
    run: (fn) => sequelize.transaction((t) => fn(createRepos(sequelize, t))),
  };
}
