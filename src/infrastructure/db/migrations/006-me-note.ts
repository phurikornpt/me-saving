import type { QueryInterface } from "sequelize";

// The buyer's own habits ("ไม่ดื่มกาแฟ"), sent to the receipt AI next to each person's note on shared bills.
export const migration = {
  async up(qi: QueryInterface) {
    await qi.sequelize.query(`ALTER TABLE settings ADD COLUMN me_note text NOT NULL DEFAULT '';`);
  },
  async down(qi: QueryInterface) {
    await qi.sequelize.query(`ALTER TABLE settings DROP COLUMN me_note;`);
  },
};
