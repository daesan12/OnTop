CREATE TABLE jump_rope_rounds (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    seed BIGINT NOT NULL,
    rules_version TINYINT UNSIGNED NOT NULL,
    status VARCHAR(8) NOT NULL,
    started_at TIMESTAMP(3) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    completed_at TIMESTAMP(3) NULL,
    score INT NULL,
    perfect_count INT NULL,
    good_count INT NULL,
    miss_count INT NULL,
    end_reason VARCHAR(9) NULL,
    input_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    CONSTRAINT fk_jump_rope_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT uk_jump_rope_request UNIQUE (user_id, request_key),
    CONSTRAINT ck_jump_rope_seed CHECK (seed BETWEEN 0 AND 4294967295),
    CONSTRAINT ck_jump_rope_expiry CHECK (expires_at > started_at),
    CONSTRAINT ck_jump_rope_result CHECK (
        (status = 'ACTIVE' AND completed_at IS NULL AND score IS NULL AND perfect_count IS NULL
            AND good_count IS NULL AND miss_count IS NULL AND end_reason IS NULL AND input_hash IS NULL)
        OR (status = 'SETTLED' AND completed_at IS NOT NULL AND score IS NOT NULL AND perfect_count IS NOT NULL
            AND good_count IS NOT NULL AND miss_count IS NOT NULL AND end_reason IS NOT NULL AND input_hash IS NOT NULL
            AND completed_at BETWEEN started_at AND expires_at AND score >= 0 AND perfect_count >= 0 AND good_count >= 0
            AND ((end_reason = 'time' AND miss_count BETWEEN 0 AND 2) OR (end_reason = 'missLimit' AND miss_count = 3)))),
    INDEX ix_jump_rope_latest (user_id, id),
    INDEX ix_jump_rope_bests (rules_version, status, user_id, score DESC, miss_count, completed_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
