-- S15P31B105-355. Coin-only valuation until clothing prices are approved.
-- A frozen row for each eligible wallet preserves the cutoff balance and tie evidence.
CREATE TABLE event_asset_snapshots (
    event_round_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    wallet_id BIGINT NOT NULL,
    coin_balance BIGINT NOT NULL,
    first_reached_at TIMESTAMP(3) NOT NULL,
    first_reached_transaction_id BIGINT NULL,
    excluded_gm BOOLEAN NOT NULL,
    captured_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_event_asset_snapshots PRIMARY KEY (event_round_id, user_id),
    CONSTRAINT fk_event_asset_snapshots_round FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
    CONSTRAINT fk_event_asset_snapshots_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_event_asset_snapshots_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    CONSTRAINT fk_event_asset_snapshots_reached_transaction
        FOREIGN KEY (first_reached_transaction_id) REFERENCES wallet_transactions(id),
    CONSTRAINT ck_event_asset_snapshots_balance CHECK (coin_balance >= 0),
    CONSTRAINT ck_event_asset_snapshots_reached CHECK (first_reached_at <= captured_at),
    INDEX ix_event_asset_snapshots_ranking (event_round_id, excluded_gm, coin_balance DESC, first_reached_at, user_id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;
