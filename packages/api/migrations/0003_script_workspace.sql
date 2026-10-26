-- Existing Scripts (including the local public fixture) predate change tracking.
ALTER TABLE scripts ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scripts ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX scripts_owner_updated ON scripts(owner_id, updated_at);
