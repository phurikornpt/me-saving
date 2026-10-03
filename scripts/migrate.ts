import { getSequelize } from "../src/infrastructure/db/sequelize";
import { createMigrator } from "../src/infrastructure/db/migrate";

async function main() {
  const sequelize = getSequelize();
  try {
    const migrator = createMigrator(sequelize);
    const cmd = process.argv[2] ?? "up";
    const done = cmd === "down" ? await migrator.down() : await migrator.up();
    console.log(`${cmd}:`, done.map((m) => m.name).join(", ") || "(nothing to do)");
  } finally {
    await sequelize.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
