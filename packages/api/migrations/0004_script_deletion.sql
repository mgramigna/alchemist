-- Durable owner-scoped receipts allow private R2 cleanup to be retried after
-- the Script and all dependent rows have been removed atomically from D1.
-- Receipts intentionally survive cleanup and cannot restore a Script.
CREATE TABLE script_deletions (
  script_id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  cleanup_pending INTEGER NOT NULL DEFAULT 1 CHECK (cleanup_pending IN (0, 1))
);
