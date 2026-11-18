-- 확정된 두더지·스피드 두더지 판의 타이밍 매크로 신호(S15P31B105-449). 운영자 조회 전용이며 판정·보상·랭킹에는 쓰지 않는다.
-- 두 게임의 판 테이블이 달라 외래 키는 두지 않는다. 판은 (game, round_id)로 찾는다.
-- segments: 구간별 [{samples, medianMs, spreadMs}]. 두더지 잡기는 30초 구간별 반응 시간, 스피드 두더지는 20초 구간별 타격 간격.
CREATE TABLE mole_timing_audits (
    game VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    round_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    rules_version TINYINT UNSIGNED NOT NULL,
    reaction_count INT NOT NULL,
    median_reaction_ms INT NULL,
    segments JSON NOT NULL,
    fast_reaction BOOLEAN NOT NULL,
    steady_timing BOOLEAN NOT NULL,
    received_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_mole_timing_audits PRIMARY KEY (game, round_id),
    CONSTRAINT ck_mole_timing_audits_game CHECK (game IN ('whack-a-mole', 'speed-mole')),
    CONSTRAINT ck_mole_timing_audits_counts CHECK (reaction_count >= 0),
    INDEX ix_mole_timing_audits_window (game, received_at, user_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
