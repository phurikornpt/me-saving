import type { QueryInterface } from "sequelize";

// The AI's plain-language summary of a month (AI roadmap phase 3), kept so the model is called at most once
// per account per month. Like the other tables it belongs to an account through user_id and every query
// filters on it; deleting the account deletes its summaries. Only the generated text is stored, never
// what it was made from.
export const migration = {
  async up(qi: QueryInterface) {
    await qi.sequelize.query(`
      CREATE TABLE monthly_summaries (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        text text NOT NULL CHECK (length(text) BETWEEN 1 AND 600),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, month)
      );
    `);
  },

  async down(qi: QueryInterface) {
    await qi.sequelize.query("DROP TABLE monthly_summaries;");
  },
};
