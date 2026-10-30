-- 돌탑 점프맵 판·문 지급·하루 수입·사람별 기록 (BE 작업명세 10장).
-- 명시적으로 db/minigame을 Flyway locations에 추가한 환경에만 적용한다. 공통 users/wallets는 재사용한다.
CREATE TABLE jump_runs (
    id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id BIGINT NOT NULL,
    channel_id VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    end_reason VARCHAR(16) NULL,
    rules_version VARCHAR(16) NOT NULL,
    course_version VARCHAR(32) NOT NULL,
    is_first_run BOOLEAN NOT NULL,
    started_at TIMESTAMP(3) NOT NULL,
    ended_at TIMESTAMP(3) NULL,
    gates_passed TINYINT NOT NULL DEFAULT 0,
    gate_times_ms JSON NOT NULL,
    landings JSON NULL,
    final_reached BOOLEAN NOT NULL DEFAULT FALSE,
    max_height DOUBLE NOT NULL DEFAULT 0,
    coins_granted INT NOT NULL DEFAULT 0,
    elapsed_ms BIGINT NULL,
    finish_ms BIGINT NULL,
    suspicious BOOLEAN NOT NULL DEFAULT FALSE,
    suspicious_reasons JSON NULL,
    CONSTRAINT pk_jump_runs PRIMARY KEY (id),
    CONSTRAINT fk_jump_runs_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_jump_runs_status CHECK (status IN ('STARTED', 'ENDED')),
    CONSTRAINT ck_jump_runs_reason CHECK (end_reason IS NULL
        OR end_reason IN ('FINISH', 'FALL', 'LAKE', 'DISCONNECT', 'TIMEOUT', 'RESET', 'LEFT')),
    CONSTRAINT ck_jump_runs_ended CHECK ((status = 'STARTED' AND end_reason IS NULL AND ended_at IS NULL)
        OR (status = 'ENDED' AND end_reason IS NOT NULL AND ended_at IS NOT NULL)),
    CONSTRAINT ck_jump_runs_gates CHECK (gates_passed BETWEEN 0 AND 7),
    CONSTRAINT ck_jump_runs_coins CHECK (coins_granted BETWEEN 0 AND 100),
    INDEX ix_jump_runs_user_status (user_id, status),
    INDEX ix_jump_runs_status_started (status, started_at),
    INDEX ix_jump_runs_reason_finish (end_reason, finish_ms)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- (판, 문) 기본 키로 같은 문은 한 번만 기록·지급한다. PENDING은 지갑 반영 전이다.
CREATE TABLE jump_gate_rewards (
    run_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    gate TINYINT NOT NULL,
    user_id BIGINT NOT NULL,
    kst_date DATE NOT NULL,
    coins_calculated INT NOT NULL,
    coins_granted INT NULL,
    status VARCHAR(16) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    settled_at TIMESTAMP(3) NULL,
    CONSTRAINT pk_jump_gate_rewards PRIMARY KEY (run_id, gate),
    CONSTRAINT fk_jump_gate_rewards_run FOREIGN KEY (run_id) REFERENCES jump_runs(id),
    CONSTRAINT fk_jump_gate_rewards_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_jump_gate_rewards_gate CHECK (gate BETWEEN 1 AND 7),
    CONSTRAINT ck_jump_gate_rewards_status CHECK ((status = 'PENDING' AND coins_granted IS NULL AND settled_at IS NULL)
        OR (status = 'GRANTED' AND coins_granted IS NOT NULL AND settled_at IS NOT NULL)),
    CONSTRAINT ck_jump_gate_rewards_coins CHECK (coins_calculated >= 0
        AND (coins_granted IS NULL OR coins_granted BETWEEN 0 AND coins_calculated)),
    INDEX ix_jump_gate_rewards_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 붕어빵 하루 수입과 별도로 둔다. 한국 시간 날짜 기준 최대 100냥.
CREATE TABLE jump_daily_earnings (
    user_id BIGINT NOT NULL,
    kst_date DATE NOT NULL,
    coins_earned INT NOT NULL DEFAULT 0,
    CONSTRAINT pk_jump_daily_earnings PRIMARY KEY (user_id, kst_date),
    CONSTRAINT fk_jump_daily_earnings_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_jump_daily_earnings_coins CHECK (coins_earned BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE jump_profiles (
    user_id BIGINT NOT NULL,
    first_run_at TIMESTAMP(3) NULL,
    seen_tips JSON NOT NULL,
    best_finish_ms BIGINT NULL,
    best_run_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_jump_profiles PRIMARY KEY (user_id),
    CONSTRAINT fk_jump_profiles_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_jump_profiles_best CHECK (best_finish_ms IS NULL OR best_finish_ms > 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
