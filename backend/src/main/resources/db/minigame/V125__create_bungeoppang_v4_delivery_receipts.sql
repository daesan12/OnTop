-- 붕어빵 v4 Story 2: 승인 action prefix와 납품 최초 판정 영수증을 영속화한다.
-- 기존 V124 판·주문 원본은 수정하지 않으며 Wallet/원장에는 영향을 주지 않는다.
CREATE TABLE bungeoppang_v4_progress (
    minigame_session_id BIGINT NOT NULL PRIMARY KEY,
    accepted_log_json MEDIUMTEXT NOT NULL,
    CONSTRAINT fk_bungeoppang_v4_progress_round FOREIGN KEY (minigame_session_id)
        REFERENCES bungeoppang_v4_rounds(minigame_session_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE bungeoppang_v4_receipts (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    minigame_session_id BIGINT NOT NULL,
    operation VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_order_id BIGINT NULL,
    accepted_order_id BIGINT NULL,
    outcome VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    http_status INT NOT NULL,
    response_json MEDIUMTEXT NOT NULL,
    through_seq INT NOT NULL,
    prefix_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT uk_bungeoppang_v4_receipt_key UNIQUE
        (minigame_session_id, operation, request_key),
    CONSTRAINT uk_bungeoppang_v4_accepted_order UNIQUE
        (minigame_session_id, accepted_order_id),
    CONSTRAINT fk_bungeoppang_v4_receipt_round FOREIGN KEY (minigame_session_id)
        REFERENCES bungeoppang_v4_rounds(minigame_session_id),
    CONSTRAINT ck_bungeoppang_v4_receipt_operation CHECK (operation IN ('DELIVERY', 'COMPLETE')),
    CONSTRAINT ck_bungeoppang_v4_receipt_outcome CHECK (outcome IN ('ACCEPTED', 'REJECTED')),
    CONSTRAINT ck_bungeoppang_v4_receipt_http CHECK (http_status BETWEEN 200 AND 599),
    CONSTRAINT ck_bungeoppang_v4_receipt_seq CHECK (through_seq >= 0),
    INDEX ix_bungeoppang_v4_receipt_order (minigame_session_id, target_order_id),
    INDEX ix_bungeoppang_v4_receipt_created (created_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
