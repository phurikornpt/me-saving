import { Op, type Sequelize, type Transaction } from "sequelize";
import { bangkokDayRange } from "@/domain/day";
import type {
  EntryRecord,
  EntryRepo,
  LoggedDayRepo,
  NewEntry,
  Repos,
  TransactionRunner,
  XpRepo,
} from "@/application/ports";
import { initModels, type Entry } from "../models";

const toRecord = (e: Entry): EntryRecord => ({
  id: e.id,
  kind: e.kind,
  occurredAt: e.occurredAt,
  createdAt: e.createdAt,
  total: e.total,
  partnerShare: e.partnerShare,
  categoryId: e.categoryId,
  note: e.note,
  merchant: e.merchant,
  source: e.source,
});

/** Every repo gets the same transaction, so one use case commits or rolls back as a unit. */
export function createRepos(sequelize: Sequelize, transaction?: Transaction): Repos {
  const m = initModels(sequelize);
  const t = { transaction };

  const entries: EntryRepo = {
    async insert(e: NewEntry) {
      return toRecord(await m.Entry.create({ ...e }, t));
    },
    async partnerLedger() {
      const [expenses, repayments] = await Promise.all([
        m.Entry.findAll({
          attributes: ["id", "occurredAt", "partnerShare"],
          where: { kind: "expense", partnerShare: { [Op.gt]: 0 } },
          ...t,
        }),
        m.Entry.findAll({ attributes: ["total"], where: { kind: "repayment" }, ...t }),
      ]);
      return {
        expenses: expenses.map((r) => ({
          id: r.id,
          occurredAt: r.occurredAt,
          partnerShare: r.partnerShare,
        })),
        repayments: repayments.map((r) => ({ total: r.total })),
      };
    },
    async recent(limit) {
      const rows = await m.Entry.findAll({
        order: [
          ["occurredAt", "DESC"],
          ["createdAt", "DESC"],
        ],
        limit,
        ...t,
      });
      return rows.map(toRecord);
    },
  };

  const loggedDays: LoggedDayRepo = {
    async has(day) {
      return (await m.LoggedDay.count({ where: { day }, ...t })) > 0;
    },
    async add(day, kind, at) {
      await m.LoggedDay.findOrCreate({
        where: { day },
        defaults: { day, kind, firstLoggedAt: at },
        ...t,
      });
    },
    async allDays() {
      const rows = await m.LoggedDay.findAll({ attributes: ["day"], order: [["day", "ASC"]], ...t });
      return rows.map((r) => r.day);
    },
  };

  const xp: XpRepo = {
    async add(reason, amount, at) {
      await m.XpEvent.create({ reason, amount, createdAt: at }, t);
    },
    async total() {
      return (await m.XpEvent.sum("amount", t)) || 0;
    },
    async extraEntryXpOnDay(day) {
      const { start, end } = bangkokDayRange(day);
      const sum = await m.XpEvent.sum("amount", {
        where: { reason: "extra_entry", createdAt: { [Op.gte]: start, [Op.lt]: end } },
        ...t,
      });
      return sum || 0;
    },
  };

  return { entries, loggedDays, xp };
}

export function createTransactionRunner(sequelize: Sequelize): TransactionRunner {
  return {
    run: (fn) => sequelize.transaction((tx) => fn(createRepos(sequelize, tx))),
  };
}
