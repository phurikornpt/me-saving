import type { QueryInterface } from "sequelize";

// Which preset an entry was logged from, so a preset can offer the prices actually paid with it
// (ข้าว 50 / 55 / 60). Entries logged before this have no link: we match them back by their label
// (a preset logs its label as the note), which misses any that were renamed since. That only thins
// the price history; totals are untouched.
export const migration = {
  async up(qi: QueryInterface) {
    await qi.sequelize.query(`
      ALTER TABLE entries ADD COLUMN preset_id uuid REFERENCES presets(id) ON DELETE SET NULL;
      CREATE INDEX entries_preset_idx ON entries (user_id, preset_id, occurred_at DESC) WHERE preset_id IS NOT NULL;
      UPDATE entries e SET preset_id = p.id
        FROM presets p
       WHERE e.source = 'preset' AND e.preset_id IS NULL AND p.user_id = e.user_id AND p.label = e.note
         AND (SELECT count(*) FROM presets q WHERE q.user_id = p.user_id AND q.label = p.label) = 1;
    `);
  },
  async down(qi: QueryInterface) {
    await qi.sequelize.query(`
      DROP INDEX IF EXISTS entries_preset_idx;
      ALTER TABLE entries DROP COLUMN IF EXISTS preset_id;
    `);
  },
};
