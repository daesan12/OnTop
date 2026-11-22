-- 겨울 광장: 트리 편지와 누적 점등 기록을 보관한다.
-- 기존 익명 메모함·게임·지갑 테이블은 변경하지 않는다.
CREATE TABLE winter_community_board (
    id TINYINT NOT NULL,
    actor_salt VARBINARY(32) NOT NULL,
    message_count BIGINT NOT NULL DEFAULT 0,
    lit_at DATETIME(3) NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT chk_winter_board_id CHECK (id = 1),
    CONSTRAINT chk_winter_board_count CHECK (message_count >= 0 AND revision >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE winter_tree_messages (
    id BIGINT NOT NULL AUTO_INCREMENT,
    actor_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    body VARCHAR(300) NOT NULL,
    ornament VARCHAR(16) NOT NULL,
    anonymous BOOLEAN NOT NULL,
    display_name VARCHAR(64) NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_winter_tree_operation (actor_key, operation_id),
    KEY idx_winter_tree_created (created_at, id),
    KEY idx_winter_tree_actor_created (actor_key, created_at),
    CONSTRAINT chk_winter_tree_ornament CHECK (ornament IN ('STOCKING', 'BAUBLE', 'BELL', 'GIFT')),
    CONSTRAINT chk_winter_tree_visibility CHECK (
        (anonymous = TRUE AND display_name IS NULL)
        OR (anonymous = FALSE AND display_name IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
