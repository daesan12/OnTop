-- Local draft: reserve V151 with the team before pushing/merging/applying to a shared DB.
-- Speed mole is a separate 60-second game; existing mole/bungeoppang records are unchanged.
CREATE TABLE speed_mole_rounds (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    seed BIGINT NOT NULL,
    rules_version TINYINT NOT NULL,
    status VARCHAR(8) NOT NULL,
    started_at TIMESTAMP(3) NOT NULL,
    completed_at TIMESTAMP(3) NULL,
    score INT NULL,
    hits INT NULL,
    misses INT NULL,
    CONSTRAINT fk_speed_mole_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT uk_speed_mole_request UNIQUE (user_id, request_key),
    CONSTRAINT ck_speed_mole_seed CHECK (seed BETWEEN 0 AND 4294967295),
    CONSTRAINT ck_speed_mole_result CHECK (
        (status = 'ACTIVE' AND completed_at IS NULL AND score IS NULL AND hits IS NULL AND misses IS NULL)
        OR (status = 'SETTLED' AND completed_at IS NOT NULL AND score IS NOT NULL AND hits IS NOT NULL AND misses IS NOT NULL
            AND score >= 0 AND hits >= 0 AND misses >= 0
            AND score <= hits AND hits + misses <= 6000)),
    INDEX ix_speed_mole_bests (rules_version, status, user_id, score, misses, completed_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
