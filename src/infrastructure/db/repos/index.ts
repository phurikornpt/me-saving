import { Op, type Sequelize, type Transaction } from "sequelize";
import { bangkokDayRange } from "@/domain/day";
import type {
  EntryRecord,
  EntryRepo,
  LoggedDayRepo,
  NewEntry,
  OwnerMemoryRepo,
  PersonRecord,
  PersonRepo,
  ReceiptLineRepo,
  Repos,
  TransactionRunner,
  XpRepo,
} from "@/application/ports";
import { sumShares, type Share } from "@/domain/split";
import { initModels, type Entry, type Person } from "../models";

const toRecord = (e: Entry, shares: Share[] = (e.shares ?? []).map((s) => ({ personId: s.personId, amount: s.amount }))): EntryRecord => ({
  id: e.id,
  kind: e.kind,
  occurredAt: e.occurredAt,
  createdAt: e.createdAt,
  total: e.total,
  shares,
  othersShare: e.othersShare,
  personId: e.personId,
  categoryId: e.categoryId,
  note: e.note,
  merchant: e.merchant,
  source: e.source,
});

export const toPerson = (p: Person): PersonRecord => ({
  id: p.id,
  name: p.name,
  note: p.note,
  sort: p.sort,
  archived: p.archived,
});

/** Every repo gets the same transaction, so one use case commits or rolls back as a unit. */
export function createRepos(sequelize: Sequelize, transaction?: Transaction): Repos {
  const m = initModels(sequelize);
  const t = { transaction };
  const withShares = { include: [{ model: m.EntryShare, as: "shares", attributes: ["personId", "amount"] }] };

  const writeShares = (entryId: string, shares: Share[]) =>
    m.EntryShare.bulkCreate(shares.map((s) => ({ entryId, personId: s.personId, amount: s.amount })), t);

  const entries: EntryRepo = {
    async insert({ shares, ...e }: NewEntry) {
      const row = await m.Entry.create({ ...e, othersShare: sumShares(shares) }, t);
      if (shares.length) await writeShares(row.id, shares);
      return toRecord(row, shares);
    },
    async ledger() {
      const [shares, repayments] = await Promise.all([
        m.EntryShare.findAll({
          attributes: ["entryId", "personId", "amount"],
          include: [{ model: m.Entry, attributes: ["occurredAt"], where: { kind: "expense" } }],
          ...t,
        }),
        m.Entry.findAll({ attributes: ["personId", "total"], where: { kind: "repayment" }, ...t }),
      ]);
      return {
        shares: shares.map((s) => ({
          entryId: s.entryId,
          personId: s.personId,
          occurredAt: (s as unknown as { Entry: Entry }).Entry.occurredAt,
          amount: s.amount,
        })),
        repayments: repayments.map((r) => ({ personId: r.personId!, total: r.total })),
      };
    },
    async recent(limit) {
      const rows = await m.Entry.findAll({
        order: [
          ["occurredAt", "DESC"],
          ["createdAt", "DESC"],
        ],
        limit,
        ...withShares,
        ...t,
      });
      return rows.map((r) => toRecord(r));
    },
    async onDay(day) {
      const { start, end } = bangkokDayRange(day);
      const rows = await m.Entry.findAll({
        where: { occurredAt: { [Op.gte]: start, [Op.lt]: end } },
        order: [["occurredAt", "DESC"]],
        ...withShares,
        ...t,
      });
      return rows.map((r) => toRecord(r));
    },
    async findById(id) {
      const row = await m.Entry.findByPk(id, { ...withShares, ...t });
      return row ? toRecord(row) : null;
    },
    async update(id, { shares, ...patch }) {
      const row = await m.Entry.findByPk(id, { ...withShares, ...t });
      if (!row) return null;
      if (shares) {
        await m.EntryShare.destroy({ where: { entryId: id }, ...t });
        if (shares.length) await writeShares(id, shares);
      }
      await row.update({ ...patch, ...(shares && { othersShare: sumShares(shares) }) }, t);
      return toRecord(row, shares ?? (row.shares ?? []).map((s) => ({ personId: s.personId, amount: s.amount })));
    },
    async remove(id) {
      return (await m.Entry.destroy({ where: { id }, ...t })) > 0; // lines and shares cascade in the DB
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

  const receiptLines: ReceiptLineRepo = {
    async insertMany(entryId, lines) {
      await m.ReceiptLine.bulkCreate(
        lines.map(({ owners, ...l }, position) => ({ ...l, includesMe: owners.me, people: owners.people, entryId, position })),
        t,
      );
    },
  };

  const ownerMemory: OwnerMemoryRepo = {
    async all() {
      const rows = await m.OwnerMemory.findAll(t);
      return new Map(rows.map((r) => [r.canonicalName, { me: r.includesMe, people: r.people }]));
    },
    async upsertMany(items, at) {
      if (items.length === 0) return;
      // later duplicates within one receipt win, matching what the user saw last
      const unique = [...new Map(items.map((i) => [i.canonicalName, i])).values()];
      await m.OwnerMemory.bulkCreate(
        unique.map((i) => ({ canonicalName: i.canonicalName, includesMe: i.owners.me, people: i.owners.people, updatedAt: at })),
        { ...t, updateOnDuplicate: ["includesMe", "people", "updatedAt"] },
      );
    },
  };

  const people: PersonRepo = {
    async list() {
      return (await m.Person.findAll({ order: [["sort", "ASC"], ["name", "ASC"]], ...t })).map(toPerson);
    },
    async create(p) {
      return toPerson(await m.Person.create(p, t));
    },
    async update(id, patch) {
      const row = await m.Person.findByPk(id, t);
      return row ? toPerson(await row.update(patch, t)) : null;
    },
  };

  return { entries, loggedDays, xp, receiptLines, ownerMemory, people };
}

export function createTransactionRunner(sequelize: Sequelize): TransactionRunner {
  return {
    run: (fn) => sequelize.transaction((tx) => fn(createRepos(sequelize, tx))),
  };
}
