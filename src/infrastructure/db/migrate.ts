import { Umzug } from "umzug";
import type { Sequelize } from "sequelize";
import { migration as m001 } from "./migrations/001-initial";
import { migration as m002 } from "./migrations/002-seed-categories";
import { migration as m003 } from "./migrations/003-itemized-source";
import { migration as m004 } from "./migrations/004-people";

const migrations = [
  { name: "001-initial", ...m001 },
  { name: "002-seed-categories", ...m002 },
  { name: "003-itemized-source", ...m003 },
  { name: "004-people", ...m004 },
];

export function createMigrator(sequelize: Sequelize) {
  const qi = sequelize.getQueryInterface();
  return new Umzug({
    migrations: migrations.map((m) => ({
      name: m.name,
      up: async () => void (await m.up(qi)),
      down: async () => void (await m.down(qi)),
    })),
    context: qi,
    storage: {
      async executed() {
        await sequelize.query(
          "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)",
        );
        const [rows] = await sequelize.query("SELECT name FROM schema_migrations ORDER BY name");
        return (rows as { name: string }[]).map((r) => r.name);
      },
      async logMigration({ name }) {
        await sequelize.query("INSERT INTO schema_migrations (name) VALUES (:name)", {
          replacements: { name },
        });
      },
      async unlogMigration({ name }) {
        await sequelize.query("DELETE FROM schema_migrations WHERE name = :name", {
          replacements: { name },
        });
      },
    },
    logger: undefined,
  });
}
