CREATE TABLE feedback_messages (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    channel_id VARCHAR(64) NOT NULL,
    body VARCHAR(600) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_feedback_request UNIQUE (user_id, request_key),
    CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX ix_feedback_created (created_at, id),
    INDEX ix_feedback_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
