-- 번호·적용 순서 팀 확인 전 푸시/병합/공용 DB 적용 보류.
CREATE TABLE announcements (
    id CHAR(36) NOT NULL,
    title VARCHAR(80) NOT NULL,
    text VARCHAR(1000) NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    starts_at TIMESTAMP(3) NULL,
    ends_at TIMESTAMP(3) NULL,
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL,
    updated_by BIGINT NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_announcements_display (deleted, display_order, id),
    CONSTRAINT ck_announcements_order CHECK (display_order BETWEEN 0 AND 9999),
    CONSTRAINT ck_announcements_period CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
