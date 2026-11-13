-- Local only. V167 is team-owned; confirm V168/V169 application order before publishing.
-- Preserve existing image data; new uploads use S3 keys and an empty legacy image value.
ALTER TABLE entry_news ADD COLUMN image_key VARCHAR(512) NULL;
