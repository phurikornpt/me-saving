import { QueryTypes, type QueryInterface } from "sequelize";
import type { Account } from "../../security/accounts";
import { seedUserDefaults } from "../default-categories";

export interface UsersMigrationContext {
  /** The account that owns everything recorded so far (AUTH_EMAIL / AUTH_PASSWORD_HASH). */
  owner?: Account;
  /** AUTH_EXTRA_USERS: each becomes a separate, empty account. */
  extras: Account[];
}

// Each account gets its own data. Child tables (receipt_lines, entry_shares) belong to a user through
// their entry, so only the top-level tables get user_id.
const OWNED = ["categories", "entries", "people", "presets", "xp_events"] as const;

const addUserColumns = `
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 200),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
${OWNED.map((t) => `ALTER TABLE ${t} ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;`).join("\n")}
ALTER TABLE logged_days ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE owner_memory ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE settings ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
`;

const lockDown = `
${OWNED.map((t) => `ALTER TABLE ${t} ALTER COLUMN user_id SET NOT NULL;`).join("\n")}
ALTER TABLE logged_days ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE logged_days DROP CONSTRAINT logged_days_pkey, ADD PRIMARY KEY (user_id, day);
ALTER TABLE owner_memory ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE owner_memory DROP CONSTRAINT owner_memory_pkey, ADD PRIMARY KEY (user_id, canonical_name);
ALTER TABLE settings DROP CONSTRAINT settings_pkey, DROP CONSTRAINT IF EXISTS settings_id_check;
ALTER TABLE settings DROP COLUMN id;
ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL, ADD PRIMARY KEY (user_id);
CREATE INDEX entries_user_occurred_idx ON entries (user_id, occurred_at);
CREATE INDEX xp_events_user_created_idx ON xp_events (user_id, created_at);
`;

async function hasRecordedData(qi: QueryInterface): Promise<boolean> {
  const [row] = await qi.sequelize.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM entries) + (SELECT count(*) FROM people) + (SELECT count(*) FROM presets)
          + (SELECT count(*) FROM logged_days) + (SELECT count(*) FROM xp_events) + (SELECT count(*) FROM owner_memory) AS n`,
    { type: QueryTypes.SELECT },
  );
  return Number(row.n) > 0;
}

async function insertUser(qi: QueryInterface, a: Account): Promise<string> {
  const [row] = await qi.sequelize.query<{ id: string }>(
    "INSERT INTO users (email, password_hash) VALUES (:email, :hash) RETURNING id",
    { replacements: { email: a.email.trim().toLowerCase(), hash: a.passwordHash }, type: QueryTypes.SELECT },
  );
  return row.id;
}

export const migration = {
  async up(qi: QueryInterface, ctx: UsersMigrationContext = { extras: [] }) {
    const seq = qi.sequelize;
    await seq.query(addUserColumns);

    if (ctx.owner) {
      const owner = await insertUser(qi, ctx.owner);
      for (const t of [...OWNED, "logged_days", "owner_memory", "settings"]) {
        await seq.query(`UPDATE ${t} SET user_id = :owner`, { replacements: { owner } });
      }
      await seq.query("INSERT INTO settings (id, user_id) SELECT 1, :owner WHERE NOT EXISTS (SELECT 1 FROM settings)", {
        replacements: { owner },
      });
    } else if (await hasRecordedData(qi)) {
      throw new Error(
        "005-users: there is recorded data but no owner. Run the migration with AUTH_EMAIL and AUTH_PASSWORD_HASH set " +
          "so everything recorded so far is given to that account.",
      );
    } else {
      // Fresh install: the globally seeded categories have no owner; each account gets its own copy instead.
      await seq.query("DELETE FROM categories; DELETE FROM settings;");
    }
    await seq.query(lockDown);

    const ownerEmail = ctx.owner?.email.trim().toLowerCase();
    for (const extra of ctx.extras) {
      if (extra.email.trim().toLowerCase() === ownerEmail) continue;
      await seedUserDefaults(seq, await insertUser(qi, extra));
    }
  },

  // Best effort: keeps only the oldest account's data and goes back to one shared data set.
  async down(qi: QueryInterface) {
    await qi.sequelize.query(`
      DELETE FROM users WHERE id <> (SELECT id FROM users ORDER BY created_at, email LIMIT 1);
      DROP INDEX IF EXISTS entries_user_occurred_idx, xp_events_user_created_idx;
      ALTER TABLE settings DROP CONSTRAINT settings_pkey;
      ALTER TABLE settings ADD COLUMN id smallint NOT NULL DEFAULT 1 CHECK (id = 1);
      ALTER TABLE settings ADD PRIMARY KEY (id);
      INSERT INTO settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM settings);
      ALTER TABLE owner_memory DROP CONSTRAINT owner_memory_pkey, ADD PRIMARY KEY (canonical_name);
      ALTER TABLE logged_days DROP CONSTRAINT logged_days_pkey, ADD PRIMARY KEY (day);
      ${[...OWNED, "logged_days", "owner_memory", "settings"].map((t) => `ALTER TABLE ${t} DROP COLUMN user_id;`).join("\n")}
      DROP TABLE users;
    `);
  },
};
