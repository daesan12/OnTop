CREATE TABLE game_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    start_attempt_id BINARY(16) NOT NULL,
    request_fingerprint BINARY(32) NOT NULL,
    table_id VARCHAR(120) NOT NULL,
    table_version BIGINT NOT NULL,
    game_code VARCHAR(20) NOT NULL,
    target_score INT NULL,
    participant_count SMALLINT NOT NULL,
    bet_amount_per_player BIGINT NOT NULL,
    total_pot BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL,
    settlement_status VARCHAR(16) NULL,
    rejection_code VARCHAR(40) NULL,
    finish_event_id VARCHAR(160) NULL,
    finish_payload_hash BINARY(32) NULL,
    engine_finish_version BIGINT NULL,
    end_reason VARCHAR(32) NULL,
    result_version BIGINT NOT NULL DEFAULT 0,
    settlement_policy_version SMALLINT NOT NULL DEFAULT 1,
    tie_bonus_amount BIGINT NULL,
    payout_per_winner BIGINT NULL,
    owner_instance_id VARCHAR(64) NOT NULL,
    owner_boot_id BINARY(16) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    reserved_at TIMESTAMP(3) NULL,
    started_at TIMESTAMP(3) NULL,
    ended_at TIMESTAMP(3) NULL,
    settled_at TIMESTAMP(3) NULL,
    active_table_id VARCHAR(120) GENERATED ALWAYS AS (
        CASE WHEN status IN ('RESERVED', 'RUNNING', 'FINISHED', 'INVALID') AND settled_at IS NULL
            THEN table_id ELSE NULL END
    ) STORED,
    CONSTRAINT pk_game_sessions PRIMARY KEY (id),
    CONSTRAINT uk_game_sessions_start_attempt UNIQUE (start_attempt_id),
    CONSTRAINT uk_game_sessions_active_table UNIQUE (active_table_id),
    CONSTRAINT uk_game_sessions_finish_event UNIQUE (finish_event_id),
    CONSTRAINT ck_game_sessions_table_version CHECK (table_version >= 0),
    CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'DICE') AND participant_count = 2)
        OR (game_code IN ('ONE_CARD', 'LIAR_BRIDGE') AND participant_count BETWEEN 2 AND 4)
    ),
    CONSTRAINT ck_game_sessions_target CHECK (
        (game_code = 'DICE' AND target_score IS NOT NULL AND target_score IN (2000, 4000, 6000))
        OR (game_code <> 'DICE' AND target_score IS NULL)
    ),
    CONSTRAINT ck_game_sessions_pot CHECK (bet_amount_per_player = 1 AND total_pot = participant_count),
    CONSTRAINT ck_game_sessions_status CHECK (
        status IN ('PREPARING', 'REJECTED', 'RESERVED', 'RUNNING', 'FINISHED', 'INVALID')
    ),
    CONSTRAINT ck_game_sessions_settlement CHECK (
        (status IN ('PREPARING', 'REJECTED') AND settlement_status IS NULL AND reserved_at IS NULL)
        OR (status IN ('RESERVED', 'RUNNING', 'FINISHED', 'INVALID')
            AND settlement_status IS NOT NULL AND settlement_status IN ('PENDING', 'SETTLED')
            AND reserved_at IS NOT NULL)
    ),
    CONSTRAINT ck_game_sessions_rejection CHECK (
        (status = 'REJECTED' AND rejection_code IS NOT NULL)
        OR (status <> 'REJECTED' AND rejection_code IS NULL)
    ),
    CONSTRAINT ck_game_sessions_result_version CHECK (result_version BETWEEN 0 AND 9007199254740991),
    CONSTRAINT ck_game_sessions_policy CHECK (settlement_policy_version > 0),
    CONSTRAINT ck_game_sessions_bonus CHECK (tie_bonus_amount IS NULL OR tie_bonus_amount >= 0),
    CONSTRAINT ck_game_sessions_payout CHECK (payout_per_winner IS NULL OR payout_per_winner >= 0),
    CONSTRAINT ck_game_sessions_settled_at CHECK (
        (settlement_status = 'SETTLED' AND settled_at IS NOT NULL)
        OR ((settlement_status IS NULL OR settlement_status = 'PENDING') AND settled_at IS NULL)
    ),
    INDEX ix_game_sessions_recovery (owner_instance_id, owner_boot_id, status, settlement_status, id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

CREATE TABLE game_participants (
    id BIGINT NOT NULL AUTO_INCREMENT,
    game_session_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    seat_number SMALLINT NOT NULL,
    participant_order SMALLINT NOT NULL,
    participant_status VARCHAR(16) NOT NULL,
    result VARCHAR(10) NULL,
    leave_reason VARCHAR(32) NULL,
    left_at TIMESTAMP(3) NULL,
    reserved_amount BIGINT NOT NULL,
    coin_delta BIGINT NULL,
    reservation_released_at TIMESTAMP(3) NULL,
    active_user_id BIGINT GENERATED ALWAYS AS (
        CASE WHEN reservation_released_at IS NULL THEN user_id ELSE NULL END
    ) STORED,
    CONSTRAINT pk_game_participants PRIMARY KEY (id),
    CONSTRAINT uk_game_participants_user UNIQUE (game_session_id, user_id),
    CONSTRAINT uk_game_participants_seat UNIQUE (game_session_id, seat_number),
    CONSTRAINT uk_game_participants_order UNIQUE (game_session_id, participant_order),
    CONSTRAINT uk_game_participants_active_user UNIQUE (active_user_id),
    CONSTRAINT fk_game_participants_session FOREIGN KEY (game_session_id) REFERENCES game_sessions(id),
    CONSTRAINT fk_game_participants_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_game_participants_seat CHECK (seat_number BETWEEN 1 AND 4),
    CONSTRAINT ck_game_participants_order CHECK (participant_order BETWEEN 0 AND 3),
    CONSTRAINT ck_game_participants_status CHECK (participant_status IN ('ACTIVE', 'LEFT', 'FINISHED')),
    CONSTRAINT ck_game_participants_result CHECK (result IS NULL OR result IN ('WIN', 'LOSE', 'DRAW', 'FORFEIT')),
    CONSTRAINT ck_game_participants_departure CHECK (
        (leave_reason IS NULL AND left_at IS NULL)
        OR (leave_reason IS NOT NULL AND left_at IS NOT NULL
            AND leave_reason IN ('LOGOUT', 'MEMBER_DEACTIVATED', 'DISCONNECT_TIMEOUT'))
    ),
    CONSTRAINT ck_game_participants_reserved CHECK (reserved_amount = 1),
    INDEX ix_game_participants_user_history (user_id, game_session_id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- 기존 참조 값이 잘못되어 있으면 적용을 중단한다. 기존 원장이나 이력을 자동 보정하지 않는다.
ALTER TABLE wallet_transactions
    ADD CONSTRAINT fk_wallet_transactions_game_session
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id);
