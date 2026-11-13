-- 확정된 줄넘기 판의 점프 시각 원본과 매크로 판별 신호. 운영자 조회 전용이며 판정·보상·랭킹에는 쓰지 않는다.
-- 판을 지우면 함께 지운다. 회원은 판을 거쳐 이어지므로 따로 묶지 않는다.
CREATE TABLE jump_rope_audits (
    round_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    rules_version TINYINT UNSIGNED NOT NULL,
    jump_offsets JSON NOT NULL,
    jump_count INT NOT NULL,
    jitter_us INT NULL,
    lead_mean_us INT NULL,
    lead_sd_us INT NULL,
    whole_ms_jumps INT NOT NULL,
    submit_delay_ms BIGINT NOT NULL,
    in_park BOOLEAN NULL,
    duplicate_rounds INT NOT NULL,
    duplicate_log BOOLEAN NOT NULL,
    steady_rhythm BOOLEAN NOT NULL,
    received_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_jump_rope_audits PRIMARY KEY (round_id),
    CONSTRAINT fk_jump_rope_audits_round FOREIGN KEY (round_id) REFERENCES jump_rope_rounds(id) ON DELETE CASCADE,
    CONSTRAINT ck_jump_rope_audits_counts CHECK (jump_count >= 0 AND whole_ms_jumps >= 0 AND duplicate_rounds >= 0),
    INDEX ix_jump_rope_audits_user (user_id, received_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 같은 점프 기록의 재제출을 판 확정 때와 운영자 조회 때 찾는다.
CREATE INDEX ix_jump_rope_input_hash ON jump_rope_rounds (input_hash);
