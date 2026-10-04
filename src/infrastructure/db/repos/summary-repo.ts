import type { Sequelize } from "sequelize";
import type { SummaryRepo } from "@/application/ports";
import { initModels } from "../models";

export function createSummaryRepo(sequelize: Sequelize, userId: string): SummaryRepo {
  const { MonthlySummary } = initModels(sequelize);
  return {
    async get(month) {
      const row = await MonthlySummary.findOne({ where: { userId, month } });
      return row && { month: row.month, text: row.text, createdAt: row.createdAt };
    },
    async save(month, text, at) {
      await MonthlySummary.upsert({ userId, month, text, createdAt: at });
    },
  };
}
