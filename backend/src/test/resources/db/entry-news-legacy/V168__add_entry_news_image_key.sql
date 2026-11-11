-- Local only. Confirm V167/V168 ownership and application order before publishing.
-- Preserve existing image data; new uploads use S3 keys and an empty legacy image value.
ALTER TABLE entry_news ADD COLUMN image_key VARCHAR(512) NULL;
