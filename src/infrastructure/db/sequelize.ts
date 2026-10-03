import { Sequelize } from "sequelize";

const globalForDb = globalThis as unknown as { __sequelize?: Sequelize };

/**
 * One Sequelize instance per function instance (cached on globalThis) with a tiny
 * pool, so serverless invocations don't exhaust Neon connections. Use the pooled
 * (-pooler) connection string in production. Node runtime only.
 */
export function createSequelize(url: string, opts: { ssl?: boolean } = {}): Sequelize {
  return new Sequelize(url, {
    dialect: "postgres",
    logging: false,
    timezone: "+00:00",
    pool: { max: 2, min: 0, idle: 10_000, acquire: 15_000 },
    dialectOptions: opts.ssl ? { ssl: { require: true, rejectUnauthorized: true } } : {},
  });
}

export function getSequelize(): Sequelize {
  if (!globalForDb.__sequelize) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    globalForDb.__sequelize = createSequelize(url, { ssl: !local });
  }
  return globalForDb.__sequelize;
}
