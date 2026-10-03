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
export function createStatsRepo(sequelize: Sequelize): StatsRepo {
  return {
    async dailyTotals(from, toExclusive) {
      const start = bangkokDayRange(from).start;
      const end = bangkokDayRange(toExclusive).start;
      const rows = await sequelize.query<{ day: string; spent: string; earned: string }>(
        `SELECT to_char((occurred_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS day,
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN total - partner_share END), 0) AS spent,
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN total END), 0) AS earned
           FROM entries
          WHERE occurred_at >= :start AND occurred_at < :end AND kind IN ('expense', 'income')
          GROUP BY 1 ORDER BY 1`,
        { replacements: { start, end }, type: QueryTypes.SELECT },
      );
      return rows.map((r) => ({ day: r.day, spent: Number(r.spent), earned: Number(r.earned) }));
    },
    async loggedKinds(from, toExclusive) {
      const rows = await sequelize.query<{ day: string; kind: "entry" | "no_spend" }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, kind FROM logged_days
          WHERE day >= :from::date AND day < :to::date ORDER BY day`,
        { replacements: { from, to: toExclusive }, type: QueryTypes.SELECT },
      );
      return rows;
    },
  };
}

export function createCategoryRepo(sequelize: Sequelize): CategoryRepo {
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
      return (await Category.findAll({ order: [["sort", "ASC"], ["name", "ASC"]] })).map(toRec);
    },
    async create(c) {
      return toRec(await Category.create(c));
    },
    async update(id, patch) {
      const row = await Category.findByPk(id);
      if (!row) return null;
      return toRec(await row.update(patch));
    },
  };
}

export function createPresetRepo(sequelize: Sequelize): PresetRepo {
  const { Preset } = initModels(sequelize);
  const toRec = (p: InstanceType<typeof Preset>): PresetRecord => ({
    id: p.id,
    label: p.label,
    icon: p.icon,
    amount: p.amount,
    categoryId: p.categoryId,
    partnerMode: p.partnerMode,
    sort: p.sort,
  });
  return {
    async list() {
      return (await Preset.findAll({ order: [["sort", "ASC"], ["label", "ASC"]] })).map(toRec);
    },
    async create(p) {
      return toRec(await Preset.create(p));
    },
    async update(id, patch) {
      const row = await Preset.findByPk(id);
      return row ? toRec(await row.update(patch)) : null;
    },
    async remove(id) {
      return (await Preset.destroy({ where: { id } })) > 0;
    },
  };
}

export function createSettingsRepo(sequelize: Sequelize): SettingsRepo {
  const { Setting } = initModels(sequelize);
  const get = async () => {
    const [row] = await Setting.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
    return { partnerNote: row.partnerNote, dashboardLayout: normalizeLayout(row.dashboardLayout) };
  };
  return {
    get,
    async update(patch) {
      await get();
      await Setting.update(patch, { where: { id: 1 } });
      return get();
    },
  };
}
