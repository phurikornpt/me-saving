import { Op, type Sequelize } from "sequelize";
import type { LoginAttemptRepo } from "@/application/ports";
import { initModels } from "../models";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createLoginAttemptRepo(sequelize: Sequelize): LoginAttemptRepo {
  const { LoginAttempt } = initModels(sequelize);
  return {
    countSince: (key, since) =>
      LoginAttempt.count({ where: { key, attemptedAt: { [Op.gte]: since } } }),
    async record(key, at) {
      await LoginAttempt.create({ key, attemptedAt: at });
      // keep the table tiny: drop anything older than a day
      await LoginAttempt.destroy({ where: { attemptedAt: { [Op.lt]: new Date(at.getTime() - DAY_MS) } } });
    },
    async clear(key) {
      await LoginAttempt.destroy({ where: { key } });
    },
  };
}
