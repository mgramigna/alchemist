CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  google_sub TEXT
);
CREATE UNIQUE INDEX users_google_sub ON users(google_sub);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE login_flows (
  state_hash TEXT PRIMARY KEY NOT NULL,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX login_flows_expiry ON login_flows(expires_at);

CREATE TABLE scripts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  author_credit TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX scripts_owner_updated ON scripts(owner_id, updated_at);

-- Character IDs are unique within their Script, including preserved imported IDs.
CREATE TABLE characters (
  id TEXT NOT NULL,
  script_id TEXT NOT NULL REFERENCES scripts(id),
  name TEXT NOT NULL,
  ability TEXT NOT NULL,
  team TEXT NOT NULL,
  first_night_instructions TEXT NOT NULL DEFAULT '',
  other_night_instructions TEXT NOT NULL DEFAULT '',
  reminders TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reminders) AND json_type(reminders) = 'array'),
  reminders_global TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reminders_global) AND json_type(reminders_global) = 'array'),
  setup INTEGER NOT NULL DEFAULT 0 CHECK (setup IN (0, 1)),
  flavor TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (script_id, id)
);

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
CREATE TABLE jinxes (
  script_id TEXT NOT NULL REFERENCES scripts(id),
  first TEXT NOT NULL,
  second TEXT NOT NULL,
  explanation TEXT NOT NULL,
  PRIMARY KEY (script_id, first, second),
  CHECK (first < second),
  FOREIGN KEY (script_id, first) REFERENCES characters(script_id, id),
  FOREIGN KEY (script_id, second) REFERENCES characters(script_id, id)
);

-- Owner-only preserved integration fields and repairable artwork references.
CREATE TABLE script_imports (
  script_id TEXT PRIMARY KEY NOT NULL REFERENCES scripts(id),
  data TEXT NOT NULL CHECK (json_valid(data))
);
