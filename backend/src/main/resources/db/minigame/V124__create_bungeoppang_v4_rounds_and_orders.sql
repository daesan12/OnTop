-- 붕어빵 v4 Story 1: 불변 규칙/시간 원점과 현재 주문만 저장한다.
-- 납품 영수증, 승인 로그, 최종 정산 구조는 후속 Story에서 별도 migration으로 추가한다.
CREATE TABLE bungeoppang_v4_rounds (
    minigame_session_id BIGINT NOT NULL PRIMARY KEY,
    config_version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    config_json TEXT NOT NULL,
    issued_at TIMESTAMP(3) NOT NULL,
    countdown_starts_at TIMESTAMP(3) NOT NULL,
    play_starts_at TIMESTAMP(3) NOT NULL,
    play_ends_at TIMESTAMP(3) NOT NULL,
    submit_deadline TIMESTAMP(3) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    approved_through_seq INT NOT NULL DEFAULT 0,
    approved_prefix_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    checkpoint_json MEDIUMTEXT NOT NULL,
    terminal_reason VARCHAR(32) NULL,
    CONSTRAINT fk_bungeoppang_v4_round_session
        FOREIGN KEY (minigame_session_id) REFERENCES minigame_sessions(id),
    CONSTRAINT ck_bungeoppang_v4_time_order CHECK (
        issued_at <= countdown_starts_at
        AND countdown_starts_at <= play_starts_at
        AND play_starts_at < play_ends_at
        AND play_ends_at < submit_deadline
        AND submit_deadline < expires_at
    ),
    CONSTRAINT ck_bungeoppang_v4_revision CHECK (revision >= 0),
    CONSTRAINT ck_bungeoppang_v4_approved_seq CHECK (approved_through_seq >= 0),
    INDEX ix_bungeoppang_v4_expiry (expires_at, terminal_reason)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE bungeoppang_v4_orders (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    minigame_session_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL,
    order_index INT NOT NULL,
    bean INT NOT NULL,
    custard INT NOT NULL,
    pizza INT NOT NULL,
    chocolate INT NOT NULL,
    issued_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT uk_bungeoppang_v4_order_id UNIQUE (minigame_session_id, order_id),
    CONSTRAINT uk_bungeoppang_v4_order_index UNIQUE (minigame_session_id, order_index),
    CONSTRAINT fk_bungeoppang_v4_order_round FOREIGN KEY (minigame_session_id)
        REFERENCES bungeoppang_v4_rounds(minigame_session_id),
    CONSTRAINT ck_bungeoppang_v4_order_identity CHECK (order_id > 0 AND order_index >= 0),
    CONSTRAINT ck_bungeoppang_v4_order_counts CHECK (
        bean >= 0 AND custard >= 0 AND pizza >= 0 AND chocolate >= 0
        AND bean + custard + pizza + chocolate BETWEEN 1 AND 4
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
