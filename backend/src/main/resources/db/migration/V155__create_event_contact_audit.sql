-- S15P31B105-356. Keep non-sensitive submission metadata after the phone is erased.
CREATE TABLE event_contact_receipts (
    user_id BIGINT NOT NULL,
    week_start_date DATE NOT NULL,
    first_submitted_at TIMESTAMP(3) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    last_updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_event_contact_receipts PRIMARY KEY (user_id, week_start_date),
    CONSTRAINT fk_event_contact_receipts_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_event_contact_receipts_expiry CHECK (expires_at > first_submitted_at),
    CONSTRAINT ck_event_contact_receipts_update CHECK (last_updated_at >= first_submitted_at),
    INDEX ix_event_contact_receipts_expiry (expires_at)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- Existing contacts cannot outlive the new 14-day retention limit.
UPDATE event_winner_contacts
SET expires_at = LEAST(expires_at, DATE_ADD(submitted_at, INTERVAL 14 DAY));

INSERT INTO event_contact_receipts(user_id, week_start_date, first_submitted_at, expires_at, last_updated_at)
SELECT user_id, week_start_date, submitted_at, expires_at, submitted_at
FROM event_winner_contacts;

-- No phone number or ciphertext is written to the access log.
CREATE TABLE event_contact_access_audit (
    id BIGINT NOT NULL AUTO_INCREMENT,
    administrator_user_id BIGINT NOT NULL,
    winner_id BIGINT NOT NULL,
    contact_user_id BIGINT NOT NULL,
    week_start_date DATE NOT NULL,
    accessed_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_event_contact_access_audit PRIMARY KEY (id),
    CONSTRAINT fk_event_contact_access_admin FOREIGN KEY (administrator_user_id) REFERENCES users(id),
    CONSTRAINT fk_event_contact_access_winner FOREIGN KEY (winner_id) REFERENCES event_winners(id),
    CONSTRAINT fk_event_contact_access_user FOREIGN KEY (contact_user_id) REFERENCES users(id),
    INDEX ix_event_contact_access_user_week (contact_user_id, week_start_date, accessed_at),
    INDEX ix_event_contact_access_admin_time (administrator_user_id, accessed_at)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;
