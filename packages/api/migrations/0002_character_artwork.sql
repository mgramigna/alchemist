-- Current uploaded artwork per Character. The private original lives in the
-- sources bucket, while published variants are immutable and outlive this row.
CREATE TABLE character_artwork (
  script_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  style TEXT NOT NULL CHECK (json_valid(style)),
  team TEXT NOT NULL,
  variants TEXT NOT NULL CHECK (json_valid(variants) AND json_type(variants) = 'array'),
  PRIMARY KEY (script_id, character_id),
  FOREIGN KEY (script_id, character_id) REFERENCES characters(script_id, id)
);
