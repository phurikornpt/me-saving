import type { QueryInterface } from "sequelize";

// Hand-typed groups of items ("ค่า 7-11": นม, ไก่ ...) are stored like receipts, under their own source.
export const migration = {
  async up(qi: QueryInterface) {
    await qi.sequelize.query(`
      ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_source_check;
      ALTER TABLE entries ADD CONSTRAINT entries_source_check
        CHECK (source IN ('manual','preset','receipt','itemized','wheel'));
    `);
  },
  async down(qi: QueryInterface) {
    await qi.sequelize.query(`
      UPDATE entries SET source = 'receipt' WHERE source = 'itemized';
      ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_source_check;
      ALTER TABLE entries ADD CONSTRAINT entries_source_check
        CHECK (source IN ('manual','preset','receipt','wheel'));
    `);
  },
};
