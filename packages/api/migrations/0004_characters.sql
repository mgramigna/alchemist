CREATE TABLE characters (
  id TEXT PRIMARY KEY NOT NULL,
  script_id TEXT NOT NULL REFERENCES scripts(id),
  name TEXT NOT NULL,
  ability TEXT NOT NULL,
  team TEXT NOT NULL
);
CREATE INDEX characters_script ON characters(script_id, id);
