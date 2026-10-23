CREATE TABLE wallets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    reserved_balance BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT pk_wallets PRIMARY KEY (id),
    CONSTRAINT uk_wallets_user UNIQUE (user_id),
    CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_wallets_balance CHECK (balance >= 0),
    CONSTRAINT ck_wallets_reserved_balance CHECK (reserved_balance >= 0 AND reserved_balance <= balance)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

CREATE TABLE wallet_transactions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    wallet_id BIGINT NOT NULL,
    game_session_id BIGINT NULL,
    minigame_session_id BIGINT NULL,
    item_id BIGINT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    balance_delta BIGINT NOT NULL,
    reserved_delta BIGINT NOT NULL,
    idempotency_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT pk_wallet_transactions PRIMARY KEY (id),
    CONSTRAINT uk_wallet_transactions_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT fk_wallet_transactions_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    INDEX ix_wallet_transactions_wallet_id (wallet_id, id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- 경기/미니게임은 아직 스키마가 없고 items는 선택적 V100이므로 참조 ID만 보존한다.
-- 기존 회원 지급은 스키마 적용과 분리된 initializeWallets 관리 명령으로 수행한다.
