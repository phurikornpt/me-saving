import type { QueryInterface } from "sequelize";

// Wallets: where money sits (cash, a bank account, a card). Every entry belongs to one; a transfer moves
// money between two. Each account's existing entries all go into a new "เงินสด" wallet, which becomes the
// default. Balances are never stored: opening_balance + what the entries did.
//
// entries reference wallets through (user_id, wallet_id), so the database itself refuses an entry that
// points at another account's wallet.
export const migration = {
  async up(qi: QueryInterface) {
    await qi.sequelize.query(`
      CREATE TABLE wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
        icon text NOT NULL,
        opening_balance integer NOT NULL DEFAULT 0,
        sort integer NOT NULL DEFAULT 0,
        archived boolean NOT NULL DEFAULT false,
        UNIQUE (user_id, id)
      );

      INSERT INTO wallets (user_id, name, icon) SELECT id, 'เงินสด', 'payments' FROM users;

      ALTER TABLE entries ADD COLUMN wallet_id uuid, ADD COLUMN to_wallet_id uuid;
      UPDATE entries e SET wallet_id = w.id FROM wallets w WHERE w.user_id = e.user_id;
      ALTER TABLE entries
        ALTER COLUMN wallet_id SET NOT NULL,
        ADD CONSTRAINT entries_wallet_fk FOREIGN KEY (user_id, wallet_id) REFERENCES wallets (user_id, id),
        ADD CONSTRAINT entries_to_wallet_fk FOREIGN KEY (user_id, to_wallet_id) REFERENCES wallets (user_id, id),
        DROP CONSTRAINT IF EXISTS entries_kind_check,
        ADD CONSTRAINT entries_kind_check CHECK (kind IN ('expense','income','repayment','transfer')),
        ADD CONSTRAINT entries_transfer_check CHECK (
          (kind = 'transfer') = (to_wallet_id IS NOT NULL) AND to_wallet_id IS DISTINCT FROM wallet_id
        );
      CREATE INDEX entries_wallet_idx ON entries (wallet_id);
      CREATE INDEX entries_to_wallet_idx ON entries (to_wallet_id) WHERE to_wallet_id IS NOT NULL;

      ALTER TABLE presets ADD COLUMN wallet_id uuid REFERENCES wallets(id) ON DELETE SET NULL;
      ALTER TABLE settings ADD COLUMN default_wallet_id uuid REFERENCES wallets(id) ON DELETE SET NULL;
      UPDATE settings s SET default_wallet_id = w.id FROM wallets w WHERE w.user_id = s.user_id;
    `);
  },

  // Transfers have no meaning without wallets, so going back drops them.
  async down(qi: QueryInterface) {
    await qi.sequelize.query(`
      DELETE FROM entries WHERE kind = 'transfer';
      ALTER TABLE settings DROP COLUMN default_wallet_id;
      ALTER TABLE presets DROP COLUMN wallet_id;
      ALTER TABLE entries
        DROP CONSTRAINT entries_transfer_check,
        DROP CONSTRAINT entries_kind_check,
        ADD CONSTRAINT entries_kind_check CHECK (kind IN ('expense','income','repayment')),
        DROP COLUMN to_wallet_id,
        DROP COLUMN wallet_id;
      DROP TABLE wallets;
    `);
  },
};
