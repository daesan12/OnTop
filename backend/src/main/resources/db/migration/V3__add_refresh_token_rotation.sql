ALTER TABLE refresh_tokens
    ADD COLUMN rotated_at TIMESTAMP(3) NULL AFTER revoked_at,
    ADD CONSTRAINT ck_refresh_tokens_rotation CHECK (
        rotated_at IS NULL OR (revoked_at IS NOT NULL AND rotated_at = revoked_at AND rotated_at >= created_at)
    );
