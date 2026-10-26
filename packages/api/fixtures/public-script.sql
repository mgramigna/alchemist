-- Development/test only. Never included in production migrations.
INSERT OR IGNORE INTO users (id, display_name) VALUES ('01k8ac00000000000000000000', 'Fixture Owner');
INSERT OR IGNORE INTO scripts (id, owner_id, name, author_credit)
VALUES ('01k8ac00000000000000000001', '01k8ac00000000000000000000', 'The Midnight Alchemist', 'The Clocktower Collective');
INSERT OR IGNORE INTO night_order_entries (script_id, night, position, step) VALUES
  ('01k8ac00000000000000000001', 'firstNight', 0, 'dusk'),
  ('01k8ac00000000000000000001', 'firstNight', 1, 'minioninfo'),
  ('01k8ac00000000000000000001', 'firstNight', 2, 'demoninfo'),
  ('01k8ac00000000000000000001', 'firstNight', 3, 'dawn'),
  ('01k8ac00000000000000000001', 'otherNight', 0, 'dusk'),
  ('01k8ac00000000000000000001', 'otherNight', 1, 'dawn');
