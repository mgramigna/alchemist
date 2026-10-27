-- Each Character's place in its Script's Character Order. Earlier Characters
-- all start at 0 and keep their ID order until the owner reorders them.
ALTER TABLE characters ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
