import type { Sequelize, Transaction } from "sequelize";

// Every new account starts with these categories (icons are Material Symbols names). Fully editable afterwards.
export const DEFAULT_EXPENSE = [
  ["อาหาร", "restaurant"],
  ["เดินทาง", "train"],
  ["ช้อปปิ้ง", "shopping_bag"],
  ["บิล", "receipt"],
  ["บันเทิง", "movie"],
  ["สุขภาพ", "health_and_safety"],
  ["อื่นๆ", "more_horiz"],
] as const;
export const DEFAULT_INCOME = [
  ["เงินเดือน", "account_balance_wallet"],
  ["รายได้อื่น", "savings"],
] as const;

/**
 * Default categories + the settings row for a brand-new account. Migration 005 calls this before wallets
 * exist, so the wallet is seeded separately (seedDefaultWallet).
 */
export async function seedUserDefaults(sequelize: Sequelize, userId: string, transaction?: Transaction): Promise<void> {
  const rows = [
    ...DEFAULT_EXPENSE.map(([name, icon], i) => ({ name, icon, kind: "expense", sort: i })),
    ...DEFAULT_INCOME.map(([name, icon], i) => ({ name, icon, kind: "income", sort: i })),
  ];
  for (const r of rows) {
    await sequelize.query(
      "INSERT INTO categories (user_id, name, icon, kind, sort) VALUES (:userId, :name, :icon, :kind, :sort)",
      { replacements: { ...r, userId }, transaction },
    );
  }
  await sequelize.query("INSERT INTO settings (user_id) VALUES (:userId) ON CONFLICT DO NOTHING", {
    replacements: { userId },
    transaction,
  });
}

/** A brand-new account's first wallet, "เงินสด", which is also its default. Needs migration 006. */
export async function seedDefaultWallet(sequelize: Sequelize, userId: string, transaction?: Transaction): Promise<void> {
  await sequelize.query(
    `WITH w AS (INSERT INTO wallets (user_id, name, icon) VALUES (:userId, 'เงินสด', 'payments') RETURNING id)
     UPDATE settings SET default_wallet_id = (SELECT id FROM w) WHERE user_id = :userId`,
    { replacements: { userId }, transaction },
  );
}
