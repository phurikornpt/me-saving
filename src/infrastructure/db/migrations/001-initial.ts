import type { QueryInterface } from "sequelize";

// Money columns are integer satang. All timestamps are timestamptz (UTC).
const up = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL, -- Material Symbols name, e.g. restaurant
  kind text NOT NULL CHECK (kind IN ('expense','income')),
  sort integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false
);

CREATE TABLE entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('expense','income','repayment')),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  total integer NOT NULL CHECK (total > 0),
  partner_share integer NOT NULL DEFAULT 0,
  category_id uuid REFERENCES categories(id),
  note text,
  merchant text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','preset','receipt','wheel')),
  CHECK (partner_share >= 0 AND partner_share <= total),
  CHECK (kind = 'expense' OR partner_share = 0)
);
CREATE INDEX entries_occurred_at_idx ON entries (occurred_at);
CREATE INDEX entries_kind_idx ON entries (kind);

CREATE TABLE receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  raw_name text NOT NULL,
  canonical_name text NOT NULL,
  qty integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  price integer NOT NULL CHECK (price >= 0),
  owner text NOT NULL CHECK (owner IN ('me','partner','split')),
  category_id uuid REFERENCES categories(id),
  low_confidence boolean NOT NULL DEFAULT false
);
CREATE INDEX receipt_lines_entry_idx ON receipt_lines (entry_id);

CREATE TABLE owner_memory (
  canonical_name text PRIMARY KEY,
  owner text NOT NULL CHECK (owner IN ('me','partner','split')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  icon text NOT NULL, -- Material Symbols name, e.g. restaurant
  amount integer NOT NULL CHECK (amount > 0),
  category_id uuid REFERENCES categories(id),
  partner_mode text CHECK (partner_mode IN ('split','partnerAll')),
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE logged_days (
  day date PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('entry','no_spend')),
  first_logged_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0)
);
CREATE INDEX xp_events_created_idx ON xp_events (created_at);

CREATE TABLE settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  partner_note text NOT NULL DEFAULT '',
  dashboard_layout jsonb NOT NULL DEFAULT '[]'::jsonb
);
INSERT INTO settings (id) VALUES (1);

CREATE TABLE login_attempts (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_key_idx ON login_attempts (key, attempted_at);
`;

const down = `
DROP TABLE IF EXISTS login_attempts, settings, xp_events, logged_days, presets,
  owner_memory, receipt_lines, entries, categories;
`;

export const migration = {
  up: (qi: QueryInterface) => qi.sequelize.query(up),
  down: (qi: QueryInterface) => qi.sequelize.query(down),
};
