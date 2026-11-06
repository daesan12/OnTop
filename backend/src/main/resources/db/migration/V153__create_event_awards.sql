-- S15P31B105-352. All event periods use an inclusive start and an exclusive end.
-- Coordinate this project-wide Flyway version before merging with other DB work.
CREATE TABLE event_rounds (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    week_start_date DATE NOT NULL,
    starts_at TIMESTAMP(3) NOT NULL,
    ends_at TIMESTAMP(3) NOT NULL,
    announces_at TIMESTAMP(3) NOT NULL,
    raffle_round_id BIGINT NULL,
    finalized_at TIMESTAMP(3) NULL,
    finalization_source VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NULL,
    finalized_by_user_id BIGINT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT pk_event_rounds PRIMARY KEY (id),
    CONSTRAINT uk_event_rounds_type_week UNIQUE (event_type, week_start_date),
    CONSTRAINT uk_event_rounds_raffle_round UNIQUE (raffle_round_id),
    CONSTRAINT fk_event_rounds_raffle_round FOREIGN KEY (raffle_round_id) REFERENCES raffle_rounds(id),
    CONSTRAINT fk_event_rounds_finalizer FOREIGN KEY (finalized_by_user_id) REFERENCES users(id),
    CONSTRAINT ck_event_rounds_type CHECK (event_type IN ('RAFFLE', 'BUNGEOPPANG', 'JUMPMAP', 'ASSET_VALUE')),
    CONSTRAINT ck_event_rounds_period CHECK (starts_at < ends_at AND ends_at <= announces_at),
    CONSTRAINT ck_event_rounds_raffle CHECK (
        (event_type = 'RAFFLE' AND raffle_round_id IS NOT NULL)
        OR (event_type <> 'RAFFLE' AND raffle_round_id IS NULL)
    ),
    CONSTRAINT ck_event_rounds_finalization CHECK (
        (finalized_at IS NULL AND finalization_source IS NULL AND finalized_by_user_id IS NULL)
        OR (finalized_at IS NOT NULL AND finalized_at >= ends_at
            AND finalization_source IS NOT NULL AND (
                (finalization_source = 'AUTO' AND finalized_by_user_id IS NULL)
                OR (finalization_source = 'ADMIN' AND finalized_by_user_id IS NOT NULL)
            ))
    ),
    INDEX ix_event_rounds_due (event_type, ends_at, finalized_at)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- One row is one physical prize. A raffle's places can have 1, 2 and 5 slots.
CREATE TABLE event_prize_slots (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_round_id BIGINT NOT NULL,
    place TINYINT UNSIGNED NOT NULL,
    slot_number SMALLINT UNSIGNED NOT NULL,
    prize_name VARCHAR(120) NOT NULL,
    CONSTRAINT pk_event_prize_slots PRIMARY KEY (id),
    CONSTRAINT uk_event_prize_slots_round_place_slot UNIQUE (event_round_id, place, slot_number),
    CONSTRAINT uk_event_prize_slots_id_round UNIQUE (id, event_round_id),
    CONSTRAINT fk_event_prize_slots_round FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
    CONSTRAINT ck_event_prize_slots_place CHECK (place BETWEEN 1 AND 3),
    CONSTRAINT ck_event_prize_slots_slot CHECK (slot_number > 0),
    CONSTRAINT ck_event_prize_slots_name CHECK (CHAR_LENGTH(TRIM(prize_name)) BETWEEN 1 AND 120)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

CREATE TABLE event_winners (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_round_id BIGINT NOT NULL,
    prize_slot_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    raffle_ticket_id BIGINT NULL,
    source_record_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NULL,
    source_value BIGINT NULL,
    source_achieved_at TIMESTAMP(3) NULL,
    selected_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_event_winners PRIMARY KEY (id),
    CONSTRAINT uk_event_winners_slot UNIQUE (prize_slot_id),
    CONSTRAINT uk_event_winners_round_user UNIQUE (event_round_id, user_id),
    CONSTRAINT uk_event_winners_raffle_ticket UNIQUE (raffle_ticket_id),
    CONSTRAINT fk_event_winners_round FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
    CONSTRAINT fk_event_winners_slot_round FOREIGN KEY (prize_slot_id, event_round_id)
        REFERENCES event_prize_slots(id, event_round_id),
    CONSTRAINT fk_event_winners_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_event_winners_raffle_ticket FOREIGN KEY (raffle_ticket_id) REFERENCES raffle_tickets(id),
    CONSTRAINT ck_event_winners_source CHECK (raffle_ticket_id IS NULL OR source_record_id IS NULL),
    CONSTRAINT ck_event_winners_value CHECK (source_value IS NULL OR source_value >= 0),
    CONSTRAINT ck_event_winners_achieved CHECK (
        source_achieved_at IS NULL OR source_achieved_at <= selected_at
    ),
    INDEX ix_event_winners_user_selected (user_id, selected_at, id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- One encrypted contact per winner and KST week covers multiple prizes in that week.
-- The API must verify that the member won an announced award before writing here.
CREATE TABLE event_winner_contacts (
    user_id BIGINT NOT NULL,
    week_start_date DATE NOT NULL,
    encrypted_phone VARBINARY(512) NOT NULL,
    encryption_key_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    phone_last_four CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    submitted_at TIMESTAMP(3) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_event_winner_contacts PRIMARY KEY (user_id, week_start_date),
    CONSTRAINT fk_event_winner_contacts_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_event_winner_contacts_phone CHECK (OCTET_LENGTH(encrypted_phone) BETWEEN 1 AND 512),
    CONSTRAINT ck_event_winner_contacts_key CHECK (CHAR_LENGTH(TRIM(encryption_key_id)) BETWEEN 1 AND 80),
    CONSTRAINT ck_event_winner_contacts_last_four CHECK (phone_last_four REGEXP '^[0-9]{4}$'),
    CONSTRAINT ck_event_winner_contacts_expiry CHECK (expires_at > submitted_at),
    INDEX ix_event_winner_contacts_expiry (expires_at)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

CREATE TABLE event_finalization_attempts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_round_id BIGINT NOT NULL,
    trigger_source VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    administrator_user_id BIGINT NULL,
    outcome VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    candidate_count INT UNSIGNED NULL,
    excluded_gm_count INT UNSIGNED NULL,
    winner_count INT UNSIGNED NULL,
    error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    attempted_at TIMESTAMP(3) NOT NULL,
    completed_at TIMESTAMP(3) NULL,
    CONSTRAINT pk_event_finalization_attempts PRIMARY KEY (id),
    CONSTRAINT fk_event_finalization_attempts_round FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
    CONSTRAINT fk_event_finalization_attempts_administrator
        FOREIGN KEY (administrator_user_id) REFERENCES users(id),
    CONSTRAINT ck_event_finalization_attempts_source CHECK (
        (trigger_source = 'AUTO' AND administrator_user_id IS NULL)
        OR (trigger_source = 'ADMIN' AND administrator_user_id IS NOT NULL)
    ),
    CONSTRAINT ck_event_finalization_attempts_outcome CHECK (
        outcome IN ('STARTED', 'SUCCEEDED', 'ALREADY_FINALIZED', 'FAILED')
    ),
    CONSTRAINT ck_event_finalization_attempts_period CHECK (
        (outcome = 'STARTED' AND completed_at IS NULL)
        OR (outcome <> 'STARTED' AND completed_at IS NOT NULL AND completed_at >= attempted_at)
    ),
    INDEX ix_event_finalization_attempts_round_time (event_round_id, attempted_at, id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;
