-- Current uploaded logo and background per Script. The private original lives
-- in the sources bucket, while the published image is immutable and outlives this row.
CREATE TABLE script_artwork (
  script_id TEXT NOT NULL REFERENCES scripts(id),
  field TEXT NOT NULL CHECK (field IN ('logo', 'background')),
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  path TEXT NOT NULL,
  PRIMARY KEY (script_id, field)
);
