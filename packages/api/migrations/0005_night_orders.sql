ALTER TABLE characters ADD COLUMN first_night_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN other_night_instructions TEXT NOT NULL DEFAULT '';
-- The parent key for night order entries, so each entry must name a Character of its own Script.
CREATE UNIQUE INDEX characters_script_id ON characters(script_id, id);
-- One row per entry: a standard step or a member Character, never both.
CREATE TABLE night_order_entries (
  script_id TEXT NOT NULL REFERENCES scripts(id),
  night TEXT NOT NULL CHECK (night IN ('firstNight', 'otherNight')),
  position INTEGER NOT NULL,
  step TEXT CHECK (step IN ('dusk', 'minioninfo', 'demoninfo', 'dawn')),
  character_id TEXT,
  PRIMARY KEY (script_id, night, position),
  FOREIGN KEY (script_id, character_id) REFERENCES characters(script_id, id),
  CHECK ((step IS NULL) <> (character_id IS NULL))
);
CREATE UNIQUE INDEX night_order_steps ON night_order_entries(script_id, night, step);
CREATE UNIQUE INDEX night_order_characters ON night_order_entries(script_id, night, character_id);
