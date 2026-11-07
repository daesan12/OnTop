-- 로컬 작성·격리 검증만 승인됨. 팀 버전/적용 순서 확인 전 푸시·공용 DB 적용 보류.
-- V158 뒤 적용. 뽑기권 수령은 V157 gacha_inventory가 별도로 적용되어 있어야 한다.
ALTER TABLE personal_notifications
    MODIFY COLUMN reply_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

CREATE TABLE notification_rewards (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    notification_id BIGINT NOT NULL,
    administrator_id BIGINT NULL,
    kind VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL,
    body VARCHAR(1000) NOT NULL,
    claimed_at TIMESTAMP(3) NULL,
    balance_after BIGINT NULL,
    tickets_after BIGINT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_notification_reward UNIQUE (notification_id),
    CONSTRAINT fk_notification_reward_notice FOREIGN KEY (notification_id)
        REFERENCES personal_notifications(id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_reward_admin FOREIGN KEY (administrator_id)
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT ck_notification_reward_amount CHECK (amount > 0 AND amount <= 9007199254740991),
    CONSTRAINT ck_notification_reward_kind CHECK (kind IN ('COIN', 'GACHA_TICKET')),
    CONSTRAINT ck_notification_reward_receipt CHECK (
        (claimed_at IS NULL AND balance_after IS NULL AND tickets_after IS NULL)
        OR (claimed_at IS NOT NULL AND kind = 'COIN' AND balance_after >= 0 AND balance_after IS NOT NULL AND tickets_after IS NULL)
        OR (claimed_at IS NOT NULL AND kind = 'GACHA_TICKET' AND tickets_after >= 0 AND tickets_after IS NOT NULL AND balance_after IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
