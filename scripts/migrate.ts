import { getSequelize } from "../src/infrastructure/db/sequelize";
import { createMigrator } from "../src/infrastructure/db/migrate";
import { parseExtraAccounts } from "../src/infrastructure/security/accounts";
import { cleanEnv } from "../src/lib/env";

// 005-users gives everything recorded before accounts existed to AUTH_EMAIL / AUTH_PASSWORD_HASH, and turns
// AUTH_EXTRA_USERS into separate empty accounts. After that, these variables are no longer read by the app.
function accountsFromEnv() {
  const email = cleanEnv(process.env.AUTH_EMAIL);
  const passwordHash = cleanEnv(process.env.AUTH_PASSWORD_HASH);
  return {
    owner: email && passwordHash ? { email, passwordHash } : undefined,
    extras: parseExtraAccounts(cleanEnv(process.env.AUTH_EXTRA_USERS)),
  };
}

async function main() {
  const sequelize = getSequelize();
  try {
    const migrator = createMigrator(sequelize, { accounts: accountsFromEnv() });
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
