-- Local only: confirm version and order with the team before push/merge/shared DB use.
CREATE TABLE entry_news (
 id CHAR(36) NOT NULL PRIMARY KEY,
 title VARCHAR(80) NOT NULL,
 image MEDIUMBLOB NOT NULL,
 image_hash CHAR(64) NOT NULL,
 published BOOLEAN NOT NULL DEFAULT FALSE,
 display_order INT NOT NULL DEFAULT 0,
 starts_at TIMESTAMP(3) NULL,
 ends_at TIMESTAMP(3) NULL,
 deleted BOOLEAN NOT NULL DEFAULT FALSE,
 version BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMP(3) NOT NULL,
 updated_by BIGINT NOT NULL,
 INDEX ix_entry_news_display (deleted, display_order, id),
 CONSTRAINT ck_entry_news_order CHECK (display_order BETWEEN 0 AND 9999),
 CONSTRAINT ck_entry_news_period CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
