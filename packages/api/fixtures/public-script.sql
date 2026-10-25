-- Development/test only. Never included in production migrations.
INSERT OR IGNORE INTO users (id, display_name) VALUES ('01k8ac00000000000000000000', 'Fixture Owner');
INSERT OR IGNORE INTO scripts (id, owner_id, name, author_credit)
VALUES ('01k8ac00000000000000000001', '01k8ac00000000000000000000', 'The Midnight Alchemist', 'The Clocktower Collective');
