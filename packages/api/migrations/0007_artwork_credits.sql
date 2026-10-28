-- Optional attribution for uploaded images, such as a CC BY icon's creator and
-- source. Shown on the shared page only while the credited image is present.
ALTER TABLE characters ADD COLUMN artwork_credit TEXT NOT NULL DEFAULT '';
ALTER TABLE scripts ADD COLUMN logo_credit TEXT NOT NULL DEFAULT '';
ALTER TABLE scripts ADD COLUMN background_credit TEXT NOT NULL DEFAULT '';
