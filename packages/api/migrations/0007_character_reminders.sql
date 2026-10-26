ALTER TABLE characters ADD COLUMN reminders TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reminders) AND json_type(reminders) = 'array');
ALTER TABLE characters ADD COLUMN reminders_global TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reminders_global) AND json_type(reminders_global) = 'array');
ALTER TABLE characters ADD COLUMN setup INTEGER NOT NULL DEFAULT 0 CHECK (setup IN (0, 1));
ALTER TABLE characters ADD COLUMN flavor TEXT NOT NULL DEFAULT '';
