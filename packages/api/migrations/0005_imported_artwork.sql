-- Imported Character artwork: the supplied images copied unchanged, one
-- variant per imported slot, rather than variants styled from the original.
ALTER TABLE character_artwork ADD COLUMN imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0, 1));
