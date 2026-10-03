import type { QueryInterface } from "sequelize";

// The single implicit "partner" becomes people the user sets up. Whatever was fronted for the partner
// moves to a person called "แฟน" (with the old partner note as their note), so every balance stays the same.
const up = `
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  note text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false
);

INSERT INTO people (name, note)
SELECT 'แฟน', s.partner_note FROM settings s
 WHERE s.partner_note <> ''
    OR EXISTS (SELECT 1 FROM entries WHERE partner_share > 0 OR kind = 'repayment')
    OR EXISTS (SELECT 1 FROM receipt_lines WHERE owner <> 'me')
    OR EXISTS (SELECT 1 FROM owner_memory WHERE owner <> 'me')
    OR EXISTS (SELECT 1 FROM presets WHERE partner_mode IS NOT NULL);

-- What each person owes for each entry. entries.others_share is their sum, kept for the hot read paths.
CREATE TABLE entry_shares (
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id),
  amount integer NOT NULL CHECK (amount > 0),
  PRIMARY KEY (entry_id, person_id)
);
CREATE INDEX entry_shares_person_idx ON entry_shares (person_id);

INSERT INTO entry_shares (entry_id, person_id, amount)
SELECT e.id, (SELECT id FROM people LIMIT 1), e.partner_share FROM entries e WHERE e.partner_share > 0;
ALTER TABLE entries RENAME COLUMN partner_share TO others_share;

-- Who paid us back (repayments only).
ALTER TABLE entries ADD COLUMN person_id uuid REFERENCES people(id);
UPDATE entries SET person_id = (SELECT id FROM people LIMIT 1) WHERE kind = 'repayment';
ALTER TABLE entries ADD CONSTRAINT entries_person_check CHECK ((kind = 'repayment') = (person_id IS NOT NULL));

-- A line (and a remembered item) is for us, for some people, or shared between them.
ALTER TABLE receipt_lines
  ADD COLUMN includes_me boolean NOT NULL DEFAULT true,
  ADD COLUMN people uuid[] NOT NULL DEFAULT '{}';
UPDATE receipt_lines SET includes_me = (owner = 'split'), people = ARRAY[(SELECT id FROM people LIMIT 1)]
 WHERE owner IN ('partner', 'split');
ALTER TABLE receipt_lines DROP COLUMN owner;
ALTER TABLE receipt_lines ADD CONSTRAINT receipt_lines_owners_check CHECK (includes_me OR cardinality(people) > 0);

ALTER TABLE owner_memory
  ADD COLUMN includes_me boolean NOT NULL DEFAULT true,
  ADD COLUMN people uuid[] NOT NULL DEFAULT '{}';
UPDATE owner_memory SET includes_me = (owner = 'split'), people = ARRAY[(SELECT id FROM people LIMIT 1)]
 WHERE owner IN ('partner', 'split');
ALTER TABLE owner_memory DROP COLUMN owner;
ALTER TABLE owner_memory ADD CONSTRAINT owner_memory_owners_check CHECK (includes_me OR cardinality(people) > 0);

-- A fronted preset names its person; 'equal' = we and they pay the same, 'theirs' = all theirs.
ALTER TABLE presets ADD COLUMN person_id uuid REFERENCES people(id);
ALTER TABLE presets DROP CONSTRAINT IF EXISTS presets_partner_mode_check;
UPDATE presets SET person_id = (SELECT id FROM people LIMIT 1),
                   partner_mode = CASE partner_mode WHEN 'split' THEN 'equal' ELSE 'theirs' END
 WHERE partner_mode IS NOT NULL;
ALTER TABLE presets RENAME COLUMN partner_mode TO split_kind;
ALTER TABLE presets ADD CONSTRAINT presets_split_kind_check CHECK (split_kind IN ('equal', 'theirs'));
ALTER TABLE presets ADD CONSTRAINT presets_person_check CHECK ((split_kind IS NULL) = (person_id IS NULL));

ALTER TABLE settings DROP COLUMN partner_note;
UPDATE settings SET dashboard_layout = replace(dashboard_layout::text, '"partner"', '"people"')::jsonb;
`;

// Best effort: everyone folds back into the one partner (their notes are lost except the first one's).
const down = `
ALTER TABLE settings ADD COLUMN partner_note text NOT NULL DEFAULT '';
UPDATE settings SET partner_note = COALESCE((SELECT note FROM people ORDER BY sort LIMIT 1), ''),
                    dashboard_layout = replace(dashboard_layout::text, '"people"', '"partner"')::jsonb;

ALTER TABLE presets DROP CONSTRAINT presets_person_check;
ALTER TABLE presets DROP CONSTRAINT presets_split_kind_check;
ALTER TABLE presets RENAME COLUMN split_kind TO partner_mode;
UPDATE presets SET partner_mode = CASE partner_mode WHEN 'equal' THEN 'split' ELSE 'partnerAll' END
 WHERE partner_mode IS NOT NULL;
ALTER TABLE presets ADD CONSTRAINT presets_partner_mode_check CHECK (partner_mode IN ('split','partnerAll'));
ALTER TABLE presets DROP COLUMN person_id;

ALTER TABLE owner_memory ADD COLUMN owner text NOT NULL DEFAULT 'me' CHECK (owner IN ('me','partner','split'));
UPDATE owner_memory SET owner = CASE WHEN cardinality(people) = 0 THEN 'me' WHEN includes_me THEN 'split' ELSE 'partner' END;
ALTER TABLE owner_memory DROP COLUMN includes_me, DROP COLUMN people;

ALTER TABLE receipt_lines ADD COLUMN owner text NOT NULL DEFAULT 'me' CHECK (owner IN ('me','partner','split'));
UPDATE receipt_lines SET owner = CASE WHEN cardinality(people) = 0 THEN 'me' WHEN includes_me THEN 'split' ELSE 'partner' END;
ALTER TABLE receipt_lines DROP COLUMN includes_me, DROP COLUMN people;

ALTER TABLE entries DROP CONSTRAINT entries_person_check;
ALTER TABLE entries DROP COLUMN person_id;
ALTER TABLE entries RENAME COLUMN others_share TO partner_share;
DROP TABLE entry_shares;
DROP TABLE people;
`;

export const migration = {
  up: (qi: QueryInterface) => qi.sequelize.query(up),
  down: (qi: QueryInterface) => qi.sequelize.query(down),
};
