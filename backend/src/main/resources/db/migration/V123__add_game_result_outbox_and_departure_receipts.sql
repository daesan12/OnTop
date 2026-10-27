ALTER TABLE game_participants
    ADD COLUMN departure_event_version BIGINT NULL,
    ADD COLUMN departure_payload_hash BINARY(32) NULL,
    ADD CONSTRAINT ck_game_participants_departure_receipt CHECK (
        (departure_event_version IS NULL AND departure_payload_hash IS NULL)
        OR (departure_event_version IS NOT NULL AND departure_event_version BETWEEN 0 AND 9007199254740991
            AND departure_payload_hash IS NOT NULL AND left_at IS NOT NULL)
    );

CREATE TABLE game_result_outbox (
    id BIGINT NOT NULL AUTO_INCREMENT,
    game_session_id BIGINT NOT NULL,
    result_version BIGINT NOT NULL,
    payload JSON NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP(3) NOT NULL,
    lock_token BINARY(16) NULL,
    locked_until TIMESTAMP(3) NULL,
    delivered_at TIMESTAMP(3) NULL,
    last_failure_category VARCHAR(120) NULL,
    created_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_game_result_outbox PRIMARY KEY (id),
    CONSTRAINT uk_game_result_outbox_version UNIQUE (game_session_id, result_version),
    CONSTRAINT fk_game_result_outbox_session FOREIGN KEY (game_session_id) REFERENCES game_sessions(id),
    CONSTRAINT ck_game_result_outbox_version CHECK (result_version BETWEEN 1 AND 9007199254740991),
    CONSTRAINT ck_game_result_outbox_attempts CHECK (attempt_count >= 0),
    CONSTRAINT ck_game_result_outbox_lock CHECK (
        (lock_token IS NULL AND locked_until IS NULL)
        OR (lock_token IS NOT NULL AND locked_until IS NOT NULL)
    ),
    INDEX ix_game_result_outbox_due (delivered_at, next_attempt_at, id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;
