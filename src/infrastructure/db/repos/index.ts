import { Op, QueryTypes, type Sequelize, type Transaction } from "sequelize";
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
  WalletRecord,
  WalletRepo,
  XpRepo,
} from "@/application/ports";
import { sumShares, type Share } from "@/domain/split";
import { initModels, type Entry, type Person, type Wallet } from "../models";

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
  walletId: e.walletId,
  toWalletId: e.toWalletId,
});

export const toPerson = (p: Person): PersonRecord => ({
  id: p.id,
  name: p.name,
  note: p.note,
  sort: p.sort,
  archived: p.archived,
});

export const toWallet = (w: Wallet): WalletRecord => ({
  id: w.id,
  name: w.name,
  icon: w.icon,
  openingBalance: w.openingBalance,
  sort: w.sort,
  archived: w.archived,
});

/**
 * Every repo is scoped to one account: each read filters on `userId` and each write stamps it, so one
 * account can never see or touch another's data. All repos share the same transaction, so one use case
 * commits or rolls back as a unit.
 */
export function createRepos(sequelize: Sequelize, userId: string, transaction?: Transaction): Repos {
  const m = initModels(sequelize);
  const t = { transaction };
  const mine = { userId };
  const withShares = { include: [{ model: m.EntryShare, as: "shares", attributes: ["personId", "amount"] }] };

  const writeShares = (entryId: string, shares: Share[]) =>
    m.EntryShare.bulkCreate(shares.map((s) => ({ entryId, personId: s.personId, amount: s.amount })), t);

  const entries: EntryRepo = {
    async insert({ shares, ...e }: NewEntry) {
      const row = await m.Entry.create({ ...e, userId, othersShare: sumShares(shares) }, t);
      if (shares.length) await writeShares(row.id, shares);
      return toRecord(row, shares);
    },
    async ledger() {
      const [shares, repayments] = await Promise.all([
        m.EntryShare.findAll({
          attributes: ["entryId", "personId", "amount"],
          include: [{ model: m.Entry, attributes: ["occurredAt"], where: { ...mine, kind: "expense" } }],
          ...t,
        }),
        m.Entry.findAll({ attributes: ["personId", "total"], where: { ...mine, kind: "repayment" }, ...t }),
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
    async recent(limit, walletId) {
      const rows = await m.Entry.findAll({
        where: walletId ? { ...mine, [Op.or]: [{ walletId }, { toWalletId: walletId }] } : mine,
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
        where: { ...mine, occurredAt: { [Op.gte]: start, [Op.lt]: end } },
        order: [["occurredAt", "DESC"]],
        ...withShares,
        ...t,
      });
      return rows.map((r) => toRecord(r));
    },
    async findById(id) {
      const row = await m.Entry.findOne({ where: { ...mine, id }, ...withShares, ...t });
      return row ? toRecord(row) : null;
    },
    async update(id, { shares, ...patch }) {
      const row = await m.Entry.findOne({ where: { ...mine, id }, ...withShares, ...t });
      if (!row) return null;
      if (shares) {
        await m.EntryShare.destroy({ where: { entryId: id }, ...t });
        if (shares.length) await writeShares(id, shares);
      }
      await row.update({ ...patch, ...(shares && { othersShare: sumShares(shares) }) }, t);
      return toRecord(row, shares ?? (row.shares ?? []).map((s) => ({ personId: s.personId, amount: s.amount })));
    },
    async remove(id) {
      return (await m.Entry.destroy({ where: { ...mine, id }, ...t })) > 0; // lines and shares cascade in the DB
    },
  };

  const loggedDays: LoggedDayRepo = {
    async has(day) {
      return (await m.LoggedDay.count({ where: { ...mine, day }, ...t })) > 0;
    },
    async add(day, kind, at) {
      await m.LoggedDay.findOrCreate({
        where: { ...mine, day },
        defaults: { userId, day, kind, firstLoggedAt: at },
        ...t,
      });
    },
    async allDays() {
      const rows = await m.LoggedDay.findAll({ attributes: ["day"], where: mine, order: [["day", "ASC"]], ...t });
      return rows.map((r) => r.day);
    },
  };

  const xp: XpRepo = {
    async add(reason, amount, at) {
      await m.XpEvent.create({ userId, reason, amount, createdAt: at }, t);
    },
    async total() {
      return (await m.XpEvent.sum("amount", { where: mine, ...t })) || 0;
    },
    async extraEntryXpOnDay(day) {
      const { start, end } = bangkokDayRange(day);
      const sum = await m.XpEvent.sum("amount", {
        where: { ...mine, reason: "extra_entry", createdAt: { [Op.gte]: start, [Op.lt]: end } },
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
      const rows = await m.OwnerMemory.findAll({ where: mine, ...t });
      return new Map(rows.map((r) => [r.canonicalName, { me: r.includesMe, people: r.people }]));
    },
    async upsertMany(items, at) {
      if (items.length === 0) return;
      // later duplicates within one receipt win, matching what the user saw last
      const unique = [...new Map(items.map((i) => [i.canonicalName, i])).values()];
      await m.OwnerMemory.bulkCreate(
        unique.map((i) => ({ userId, canonicalName: i.canonicalName, includesMe: i.owners.me, people: i.owners.people, updatedAt: at })),
        { ...t, updateOnDuplicate: ["includesMe", "people", "updatedAt"] },
      );
    },
  };

  const people: PersonRepo = {
    async list() {
      return (await m.Person.findAll({ where: mine, order: [["sort", "ASC"], ["name", "ASC"]], ...t })).map(toPerson);
    },
    async create(p) {
      return toPerson(await m.Person.create({ ...p, userId }, t));
    },
    async update(id, patch) {
      const row = await m.Person.findOne({ where: { ...mine, id }, ...t });
      return row ? toPerson(await row.update(patch, t)) : null;
    },
  };

  const wallets: WalletRepo = {
    async list() {
      return (await m.Wallet.findAll({ where: mine, order: [["sort", "ASC"], ["name", "ASC"]], ...t })).map(toWallet);
    },
    async create(w) {
      return toWallet(await m.Wallet.create({ ...w, userId }, t));
    },
    async update(id, patch) {
      const row = await m.Wallet.findOne({ where: { ...mine, id }, ...t });
      return row ? toWallet(await row.update(patch, t)) : null;
    },
    async netFlows() {
      // Mirrors domain walletDeltas: expenses and transfers take money out of wallet_id, income and
      // repayments bring it in, and a transfer adds to to_wallet_id.
      const rows = await sequelize.query<{ wallet_id: string; net: string }>(
        `SELECT wallet_id, SUM(delta) AS net FROM (
           SELECT wallet_id, CASE WHEN kind IN ('income', 'repayment') THEN total ELSE -total END AS delta
             FROM entries WHERE user_id = :userId
           UNION ALL
           SELECT to_wallet_id, total FROM entries WHERE user_id = :userId AND kind = 'transfer'
         ) t GROUP BY wallet_id`,
        { replacements: { userId }, type: QueryTypes.SELECT, transaction },
      );
      return new Map(rows.map((r) => [r.wallet_id, Number(r.net)]));
    },
    async defaultId() {
      const [row] = await sequelize.query<{ id: string }>(
        `SELECT w.id FROM wallets w LEFT JOIN settings s ON s.user_id = w.user_id
          WHERE w.user_id = :userId AND NOT w.archived
          ORDER BY (w.id = s.default_wallet_id) IS TRUE DESC, w.sort, w.name LIMIT 1`,
        { replacements: { userId }, type: QueryTypes.SELECT, transaction },
      );
      return row?.id ?? null;
    },
    async setDefault(id) {
      await m.Setting.findOrCreate({ where: mine, defaults: { userId }, ...t });
      await m.Setting.update({ defaultWalletId: id }, { where: mine, ...t });
    },
  };

  return { entries, wallets, loggedDays, xp, receiptLines, ownerMemory, people };
}

export function createTransactionRunner(sequelize: Sequelize, userId: string): TransactionRunner {
  return {
    run: (fn) => sequelize.transaction((tx) => fn(createRepos(sequelize, userId, tx))),
  };
}
