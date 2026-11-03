CREATE TABLE admin_wallet_grant_batches (
    id BIGINT NOT NULL AUTO_INCREMENT,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    administrator_user_id BIGINT NOT NULL,
    amount_per_member BIGINT NOT NULL,
    reason VARCHAR(200) NOT NULL,
    recipient_count INT NOT NULL,
    total_amount BIGINT NOT NULL,
    executed_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_admin_wallet_grant_batches PRIMARY KEY (id),
    CONSTRAINT uk_admin_wallet_grant_batches_request UNIQUE (request_id),
    CONSTRAINT fk_admin_wallet_grant_batches_administrator
        FOREIGN KEY (administrator_user_id) REFERENCES users(id),
    CONSTRAINT ck_admin_wallet_grant_batches_amount CHECK (amount_per_member > 0),
    CONSTRAINT ck_admin_wallet_grant_batches_reason CHECK (CHAR_LENGTH(TRIM(reason)) BETWEEN 1 AND 200),
    CONSTRAINT ck_admin_wallet_grant_batches_recipients CHECK (recipient_count > 0),
    CONSTRAINT ck_admin_wallet_grant_batches_total
        CHECK (total_amount = amount_per_member * recipient_count),
    INDEX ix_admin_wallet_grant_batches_executed (executed_at, id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

CREATE TABLE admin_wallet_grant_entries (
    batch_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    wallet_transaction_id BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    CONSTRAINT pk_admin_wallet_grant_entries PRIMARY KEY (batch_id, user_id),
    CONSTRAINT uk_admin_wallet_grant_entries_transaction UNIQUE (wallet_transaction_id),
    CONSTRAINT fk_admin_wallet_grant_entries_batch
        FOREIGN KEY (batch_id) REFERENCES admin_wallet_grant_batches(id),
    CONSTRAINT fk_admin_wallet_grant_entries_user
        FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_admin_wallet_grant_entries_transaction
        FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id),
    CONSTRAINT ck_admin_wallet_grant_entries_balances
        CHECK (balance_before >= 0 AND balance_after > balance_before),
    INDEX ix_admin_wallet_grant_entries_user (user_id, batch_id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;
