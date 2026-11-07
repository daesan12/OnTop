-- 기존 의견을 보존하고 관리자 답변·개인 알림만 추가한다.
ALTER TABLE feedback_messages
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE feedback_replies (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    feedback_id BIGINT NOT NULL,
    administrator_id BIGINT NULL,
    body VARCHAR(2000) NOT NULL,
    resulting_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_feedback_reply (feedback_id, created_at, id),
    CONSTRAINT fk_feedback_reply_message FOREIGN KEY (feedback_id) REFERENCES feedback_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_reply_admin FOREIGN KEY (administrator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE personal_notifications (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    reply_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    type VARCHAR(32) NOT NULL,
    title VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    read_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_notification_reply UNIQUE (reply_id),
    INDEX ix_notification_owner (user_id, id),
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_reply FOREIGN KEY (reply_id) REFERENCES feedback_replies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
