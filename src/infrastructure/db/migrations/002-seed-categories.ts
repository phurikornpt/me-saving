import type { QueryInterface } from "sequelize";

// Default categories (icons are Material Symbols names). Fully editable by the user afterwards.
const EXPENSE = [
  ["อาหาร", "restaurant"],
  ["เดินทาง", "train"],
  ["ช้อปปิ้ง", "shopping_bag"],
  ["บิล", "receipt"],
  ["บันเทิง", "movie"],
  ["สุขภาพ", "health_and_safety"],
  ["อื่นๆ", "more_horiz"],
] as const;
const INCOME = [
  ["เงินเดือน", "account_balance_wallet"],
  ["รายได้อื่น", "savings"],
] as const;

export const migration = {
  async up(qi: QueryInterface) {
    const rows = [
      ...EXPENSE.map(([name, icon], i) => ({ name, icon, kind: "expense", sort: i })),
      ...INCOME.map(([name, icon], i) => ({ name, icon, kind: "income", sort: i })),
    ];
    for (const r of rows) {
      await qi.sequelize.query(
        "INSERT INTO categories (name, icon, kind, sort) VALUES (:name, :icon, :kind, :sort)",
        { replacements: r },
      );
    }
  },
  async down(qi: QueryInterface) {
    await qi.sequelize.query("DELETE FROM categories");
  },
};
