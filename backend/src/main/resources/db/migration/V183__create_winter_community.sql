-- 겨울 광장: 트리 편지와 누적 점등 기록, 채널별 완성 눈사람을 보관한다.
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

CREATE TABLE winter_snowman_channels (
    channel_id VARCHAR(64) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id),
    CONSTRAINT chk_winter_snowman_revision CHECK (revision >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE winter_snowmen (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    channel_id VARCHAR(64) NOT NULL,
    actor_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(40) NOT NULL,
    x DOUBLE NOT NULL,
    ground_y DOUBLE NOT NULL,
    z DOUBLE NOT NULL,
    yaw DOUBLE NOT NULL,
    base_radius DECIMAL(5,3) NOT NULL,
    middle_radius DECIMAL(5,3) NOT NULL,
    head_radius DECIMAL(5,3) NOT NULL,
    hat VARCHAR(16) NOT NULL,
    scarf VARCHAR(16) NOT NULL,
    face VARCHAR(16) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_winter_snowman_operation (actor_key, operation_id),
    KEY idx_winter_snowman_channel (channel_id, created_at, id),
    CONSTRAINT fk_winter_snowman_channel FOREIGN KEY (channel_id) REFERENCES winter_snowman_channels (channel_id),
    CONSTRAINT chk_winter_snowman_sizes CHECK (
        base_radius BETWEEN 0.65 AND 1.1
        AND middle_radius BETWEEN 0.4 AND base_radius
        AND head_radius BETWEEN 0.25 AND middle_radius
    ),
    CONSTRAINT chk_winter_snowman_hat CHECK (hat IN ('TOP_HAT', 'BEANIE', 'NONE')),
    CONSTRAINT chk_winter_snowman_scarf CHECK (scarf IN ('RED', 'GREEN', 'BLUE', 'GOLD')),
    CONSTRAINT chk_winter_snowman_face CHECK (face IN ('SMILE', 'WINK'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
