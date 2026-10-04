import { QueryTypes, type Sequelize } from "sequelize";
import { bangkokDayRange } from "@/domain/day";
import { normalizeLayout } from "@/domain/dashboard-layout";
import type {
  CategoryRecord,
  CategoryRepo,
  PresetRecord,
  PresetRepo,
  SettingsRepo,
  StatsRepo,
} from "@/application/ports";
import { initModels } from "../models";

/** Raw SQL on purpose: grouping by Bangkok day with conditional sums is a hot path the ORM can't express cheaply. */
export function createStatsRepo(sequelize: Sequelize, userId: string): StatsRepo {
  return {
    async dailyTotals(from, toExclusive, walletId, spend = "all") {
      const start = bangkokDayRange(from).start;
      const end = bangkokDayRange(toExclusive).start;
      const rows = await sequelize.query<{ day: string; spent: string; earned: string }>(
        `SELECT to_char((occurred_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS day,
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN (CASE WHEN :spend = 'all' THEN total - others_share ELSE total END) END), 0) AS spent,
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN total END), 0) AS earned
           FROM entries
          WHERE user_id = :userId AND occurred_at >= :start AND occurred_at < :end
            AND (kind = 'expense' OR (kind = 'income' AND :spend = 'all'))
            AND (:spend = 'all' OR (:spend = 'mine' AND others_share = 0) OR (:spend = 'fronted' AND others_share > 0))
            AND (CAST(:walletId AS uuid) IS NULL OR wallet_id = :walletId)
          GROUP BY 1 ORDER BY 1`,
        { replacements: { userId, start, end, walletId: walletId ?? null, spend }, type: QueryTypes.SELECT },
      );
      return rows.map((r) => ({ day: r.day, spent: Number(r.spent), earned: Number(r.earned) }));
    },
    async categoryTotals(from, toExclusive, walletId) {
      const start = bangkokDayRange(from).start;
      const end = bangkokDayRange(toExclusive).start;
      // Group entries (receipts, hand-typed groups) carry no category themselves: their lines do, and only
      // our share of each line counts. A line's price splits equally between its owners, each person's part
      // rounded down, so ours is whatever the people's parts leave over (mirrors domain lineShares).
      const rows = await sequelize.query<{ category_id: string | null; spent: string }>(
        `SELECT category_id, SUM(spent) AS spent FROM (
           SELECT category_id, total - others_share AS spent
             FROM entries
            WHERE user_id = :userId AND kind = 'expense' AND source NOT IN ('receipt', 'itemized')
              AND occurred_at >= :start AND occurred_at < :end
              AND (CAST(:walletId AS uuid) IS NULL OR wallet_id = :walletId)
           UNION ALL
           SELECT l.category_id,
                  l.price - (l.price / (cardinality(l.people) + CASE WHEN l.includes_me THEN 1 ELSE 0 END))
                            * cardinality(l.people) AS spent
             FROM receipt_lines l JOIN entries e ON e.id = l.entry_id
            WHERE e.user_id = :userId AND e.kind = 'expense' AND e.occurred_at >= :start AND e.occurred_at < :end
              AND (CAST(:walletId AS uuid) IS NULL OR e.wallet_id = :walletId)
         ) t
         GROUP BY category_id HAVING SUM(spent) > 0 ORDER BY SUM(spent) DESC`,
        { replacements: { userId, start, end, walletId: walletId ?? null }, type: QueryTypes.SELECT },
      );
      return rows.map((r) => ({ categoryId: r.category_id, spent: Number(r.spent) }));
    },
    async loggedKinds(from, toExclusive) {
      const rows = await sequelize.query<{ day: string; kind: "entry" | "no_spend" }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, kind FROM logged_days
          WHERE user_id = :userId AND day >= :from::date AND day < :to::date ORDER BY day`,
        { replacements: { userId, from, to: toExclusive }, type: QueryTypes.SELECT },
      );
      return rows;
    },
  };
}

export function createCategoryRepo(sequelize: Sequelize, userId: string): CategoryRepo {
  const { Category } = initModels(sequelize);
  const toRec = (c: InstanceType<typeof Category>): CategoryRecord => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    kind: c.kind,
    sort: c.sort,
    archived: c.archived,
  });
  return {
    async list() {
      return (await Category.findAll({ where: { userId }, order: [["sort", "ASC"], ["name", "ASC"]] })).map(toRec);
    },
    async create(c) {
      return toRec(await Category.create({ ...c, userId }));
    },
    async update(id, patch) {
      const row = await Category.findOne({ where: { userId, id } });
      if (!row) return null;
      return toRec(await row.update(patch));
    },
  };
}

export function createPresetRepo(sequelize: Sequelize, userId: string): PresetRepo {
  const { Preset } = initModels(sequelize);
  const toRec = (p: InstanceType<typeof Preset>): PresetRecord => ({
    id: p.id,
    label: p.label,
    icon: p.icon,
    amount: p.amount,
    categoryId: p.categoryId,
    personId: p.personId,
    splitKind: p.splitKind,
    walletId: p.walletId ?? null,
    sort: p.sort,
  });
  return {
    async list() {
      return (await Preset.findAll({ where: { userId }, order: [["sort", "ASC"], ["label", "ASC"]] })).map(toRec);
    },
    async create(p) {
      return toRec(await Preset.create({ ...p, userId }));
    },
    async update(id, patch) {
      const row = await Preset.findOne({ where: { userId, id } });
      return row ? toRec(await row.update(patch)) : null;
    },
    async remove(id) {
      return (await Preset.destroy({ where: { userId, id } })) > 0;
    },
    async prices(presetId, since) {
      const rows = await sequelize.query<{ amount: number; count: string; last_at: Date }>(
        `SELECT total AS amount, count(*) AS count, max(occurred_at) AS last_at
           FROM entries
          WHERE user_id = :userId AND preset_id = :presetId AND kind = 'expense' AND occurred_at >= :since
          GROUP BY total
          ORDER BY count(*) DESC, max(occurred_at) DESC`,
        { replacements: { userId, presetId, since }, type: QueryTypes.SELECT },
      );
      return rows.map((r) => ({ amount: Number(r.amount), count: Number(r.count), lastAt: new Date(r.last_at) }));
    },
  };
}

export function createSettingsRepo(sequelize: Sequelize, userId: string): SettingsRepo {
  const { Setting } = initModels(sequelize);
  const get = async () => {
    const [row] = await Setting.findOrCreate({ where: { userId }, defaults: { userId } });
    return { dashboardLayout: normalizeLayout(row.dashboardLayout), meNote: row.meNote };
  };
  return {
    get,
    async update(patch) {
      await get();
      await Setting.update(patch, { where: { userId } });
      return get();
    },
  };
}
