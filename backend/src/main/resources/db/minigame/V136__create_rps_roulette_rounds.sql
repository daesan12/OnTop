-- 가위바위보 룰렛 한 판. 참가비 차감·하루 판 수·대결 커밋·룰렛 지급을 한 행으로 확정한다.
-- 명시적으로 db/minigame을 Flyway locations에 추가한 환경에만 적용한다. 공통 users/wallets는 재사용한다.
CREATE TABLE rps_roulette_rounds (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- 진행 중인 판만 회원 ID를 가진다. NULL은 여러 개 허용되므로 회원당 진행 중 판은 최대 1개다.
    active_user_id BIGINT NULL,
    fee INT NOT NULL,
    play_date DATE NOT NULL,
    phase VARCHAR(16) NOT NULL,
    stake_level TINYINT NOT NULL DEFAULT 0,
    challenging BOOLEAN NOT NULL DEFAULT FALSE,
    seq INT NOT NULL DEFAULT 1,
    duel_no INT NOT NULL DEFAULT 1,
    -- 공개 전 기계 손과 salt는 서버만 읽는다. 응답에는 commitment만 내보낸다.
    machine_hand VARCHAR(8) NULL,
    machine_salt CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    commitment CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    input_ends_at TIMESTAMP(3) NULL,
    deadline_at TIMESTAMP(3) NULL,
    last_duel_no INT NULL,
    last_player_hand VARCHAR(8) NULL,
    last_machine_hand VARCHAR(8) NULL,
    last_salt CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_result VARCHAR(8) NULL,
    last_auto BOOLEAN NOT NULL DEFAULT FALSE,
    outcome VARCHAR(8) NULL,
    roulette_cell TINYINT NULL,
    payout INT NOT NULL DEFAULT 0,
    started_at TIMESTAMP(3) NOT NULL,
    settled_at TIMESTAMP(3) NULL,
    CONSTRAINT fk_rps_roulette_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT uk_rps_roulette_request UNIQUE (user_id, request_key),
    CONSTRAINT uk_rps_roulette_active UNIQUE (active_user_id),
    CONSTRAINT ck_rps_roulette_fee CHECK (fee IN (10, 20, 30)),
    CONSTRAINT ck_rps_roulette_phase CHECK (phase IN ('DUEL', 'DECIDE', 'SETTLED')),
    CONSTRAINT ck_rps_roulette_level CHECK (stake_level BETWEEN 0 AND 2),
    CONSTRAINT ck_rps_roulette_outcome CHECK ((phase = 'SETTLED' AND outcome IN ('LOST', 'PAID')
        AND active_user_id IS NULL AND settled_at IS NOT NULL)
        OR (phase <> 'SETTLED' AND outcome IS NULL AND active_user_id = user_id AND deadline_at IS NOT NULL)),
    CONSTRAINT ck_rps_roulette_payout CHECK (payout BETWEEN 0 AND 600),
    INDEX ix_rps_roulette_user_date (user_id, play_date),
    INDEX ix_rps_roulette_user_started (user_id, started_at),
    INDEX ix_rps_roulette_phase_deadline (phase, deadline_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
