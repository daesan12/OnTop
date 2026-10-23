CREATE TABLE behavior_events (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_id BINARY(16) NOT NULL,
    event_type VARCHAR(48) NOT NULL,
    schema_version SMALLINT NOT NULL,
    source VARCHAR(8) NOT NULL,
    occurred_at TIMESTAMP(3) NOT NULL,
    user_id BIGINT NULL,
    login_session_id VARCHAR(64) NULL,
    connection_id VARCHAR(64) NULL,
    channel_id VARCHAR(64) NULL,
    table_id VARCHAR(64) NULL,
    game_id VARCHAR(120) NULL,
    props JSON NULL,
    CONSTRAINT pk_behavior_events PRIMARY KEY (id),
    CONSTRAINT uk_behavior_events_event_id UNIQUE (event_id),
    CONSTRAINT ck_behavior_events_source CHECK (source IN ('SERVER', 'CLIENT')),
    INDEX idx_behavior_events_type_time (event_type, occurred_at),
    INDEX idx_behavior_events_user_time (user_id, occurred_at)
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_bin;
