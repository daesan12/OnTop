CREATE TABLE world_position_samples (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NULL,
    channel_id VARCHAR(64) NOT NULL,
    sampled_at TIMESTAMP(3) NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    z FLOAT NOT NULL,
    moving BOOLEAN NOT NULL,
    running BOOLEAN NOT NULL,
    swimming BOOLEAN NOT NULL,
    map_version VARCHAR(64) NOT NULL,
    CONSTRAINT pk_world_position_samples PRIMARY KEY (id),
    INDEX idx_world_position_samples_user_time (user_id, sampled_at),
    INDEX idx_world_position_samples_channel_time (channel_id, sampled_at)
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_bin;
