CREATE TABLE raffle_rounds (
    id BIGINT NOT NULL AUTO_INCREMENT,
    week_start_date DATE NOT NULL,
    sales_starts_at TIMESTAMP(3) NOT NULL,
    sales_ends_at TIMESTAMP(3) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT pk_raffle_rounds PRIMARY KEY (id),
    CONSTRAINT uk_raffle_rounds_week_start UNIQUE (week_start_date),
    CONSTRAINT ck_raffle_rounds_sales_period CHECK (sales_starts_at < sales_ends_at),
    CONSTRAINT ck_raffle_rounds_status CHECK (status IN ('SCHEDULED', 'OPEN', 'CLOSED')),
    INDEX ix_raffle_rounds_status_period (status, sales_starts_at, sales_ends_at)
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_bin;

CREATE TABLE raffle_tickets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    round_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    ticket_number SMALLINT UNSIGNED NOT NULL,
    purchase_price BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    wallet_transaction_id BIGINT NOT NULL,
    idempotency_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    purchased_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT pk_raffle_tickets PRIMARY KEY (id),
    CONSTRAINT uk_raffle_tickets_round_number UNIQUE (round_id, ticket_number),
    CONSTRAINT uk_raffle_tickets_round_user_request UNIQUE (round_id, user_id, idempotency_key),
    CONSTRAINT uk_raffle_tickets_wallet_transaction UNIQUE (wallet_transaction_id),
    CONSTRAINT fk_raffle_tickets_round FOREIGN KEY (round_id) REFERENCES raffle_rounds(id),
    CONSTRAINT fk_raffle_tickets_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_raffle_tickets_wallet_transaction
        FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id),
    CONSTRAINT ck_raffle_tickets_number CHECK (ticket_number BETWEEN 1 AND 10000),
    CONSTRAINT ck_raffle_tickets_purchase_price CHECK (purchase_price = 100),
    CONSTRAINT ck_raffle_tickets_balance_after CHECK (balance_after >= 0),
    INDEX ix_raffle_tickets_round_user_purchased (round_id, user_id, purchased_at, id)
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_bin;
