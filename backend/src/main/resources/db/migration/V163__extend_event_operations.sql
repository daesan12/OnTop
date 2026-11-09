-- S15P31B105-379. This migration adds workflow state only. It does not draw or
-- finalize any round, including the still-pending production 2026-11-02 round.

-- Keep the two original minigame codes and reserve MG_* for later games. A new
-- game still needs a server-side verified ranking adapter before it is enabled.
ALTER TABLE event_rounds DROP CHECK ck_event_rounds_type;
ALTER TABLE event_rounds ADD CONSTRAINT ck_event_rounds_type CHECK (
    event_type IN ('RAFFLE', 'BUNGEOPPANG', 'JUMPMAP', 'ASSET_VALUE')
    OR event_type REGEXP '^MG_[A-Z0-9_]{1,21}$'
);
ALTER TABLE event_rounds ADD CONSTRAINT uk_event_rounds_id_type UNIQUE (id, event_type);
ALTER TABLE event_rounds ADD CONSTRAINT uk_event_rounds_id_raffle_round UNIQUE (id, raffle_round_id);
ALTER TABLE raffle_tickets ADD CONSTRAINT uk_raffle_tickets_id_round_user
    UNIQUE (id, round_id, user_id);

-- A configured minigame is one event round. Its existing period and prize slots
-- remain the source of truth; this row selects the verified ranking rule.
CREATE TABLE event_minigame_configs (
    event_round_id BIGINT NOT NULL,
    game_code VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    ranking_rule_version VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    configured_by_user_id BIGINT NOT NULL,
    configured_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_event_minigame_configs PRIMARY KEY (event_round_id),
    CONSTRAINT fk_event_minigame_configs_round_type FOREIGN KEY (event_round_id, game_code)
        REFERENCES event_rounds(id, event_type),
    CONSTRAINT fk_event_minigame_configs_admin FOREIGN KEY (configured_by_user_id)
        REFERENCES users(id),
    CONSTRAINT ck_event_minigame_configs_code CHECK (
        game_code IN ('BUNGEOPPANG', 'JUMPMAP')
        OR game_code REGEXP '^MG_[A-Z0-9_]{1,21}$'
    ),
    CONSTRAINT ck_event_minigame_configs_name CHECK (
        CHAR_LENGTH(TRIM(display_name)) BETWEEN 1 AND 100
    ),
    CONSTRAINT ck_event_minigame_configs_rule CHECK (
        ranking_rule_version REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'
    ),
    INDEX ix_event_minigame_configs_enabled (enabled, game_code)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- A REVIEW draw is persisted before winners are final. Only one review can be
-- current for a round; a reroll supersedes it but never erases its picks.
CREATE TABLE event_raffle_draws (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_round_id BIGINT NOT NULL,
    raffle_round_id BIGINT NOT NULL,
    attempt_number INT UNSIGNED NOT NULL,
    status VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    requested_by_user_id BIGINT NOT NULL,
    reroll_reason VARCHAR(500) NULL,
    candidate_count INT UNSIGNED NOT NULL,
    excluded_gm_count INT UNSIGNED NOT NULL,
    picked_count INT UNSIGNED NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    superseded_at TIMESTAMP(3) NULL,
    confirmed_at TIMESTAMP(3) NULL,
    active_round_id BIGINT GENERATED ALWAYS AS (
        CASE WHEN status = 'REVIEW' THEN event_round_id ELSE NULL END
    ) STORED,
    confirmed_round_id BIGINT GENERATED ALWAYS AS (
        CASE WHEN status = 'CONFIRMED' THEN event_round_id ELSE NULL END
    ) STORED,
    CONSTRAINT pk_event_raffle_draws PRIMARY KEY (id),
    CONSTRAINT uk_event_raffle_draws_round_attempt UNIQUE (event_round_id, attempt_number),
    CONSTRAINT uk_event_raffle_draws_id_round_raffle UNIQUE (id, event_round_id, raffle_round_id),
    CONSTRAINT uk_event_raffle_draws_active_round UNIQUE (active_round_id),
    CONSTRAINT uk_event_raffle_draws_confirmed_round UNIQUE (confirmed_round_id),
    CONSTRAINT fk_event_raffle_draws_round FOREIGN KEY (event_round_id, raffle_round_id)
        REFERENCES event_rounds(id, raffle_round_id),
    CONSTRAINT fk_event_raffle_draws_admin FOREIGN KEY (requested_by_user_id)
        REFERENCES users(id),
    CONSTRAINT ck_event_raffle_draws_attempt CHECK (attempt_number > 0),
    CONSTRAINT ck_event_raffle_draws_status CHECK (
        (status = 'REVIEW' AND superseded_at IS NULL AND confirmed_at IS NULL)
        OR (status = 'SUPERSEDED' AND superseded_at >= created_at AND confirmed_at IS NULL)
        OR (status = 'CONFIRMED' AND superseded_at IS NULL AND confirmed_at >= created_at)
    ),
    CONSTRAINT ck_event_raffle_draws_reason CHECK (
        (attempt_number = 1 AND reroll_reason IS NULL)
        OR (attempt_number > 1 AND reroll_reason IS NOT NULL
            AND CHAR_LENGTH(TRIM(reroll_reason)) BETWEEN 1 AND 500)
    ),
    CONSTRAINT ck_event_raffle_draws_counts CHECK (
        picked_count <= candidate_count AND excluded_gm_count <= candidate_count
    )
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

CREATE TABLE event_raffle_draw_picks (
    id BIGINT NOT NULL AUTO_INCREMENT,
    draw_id BIGINT NOT NULL,
    event_round_id BIGINT NOT NULL,
    raffle_round_id BIGINT NOT NULL,
    prize_slot_id BIGINT NOT NULL,
    raffle_ticket_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    CONSTRAINT pk_event_raffle_draw_picks PRIMARY KEY (id),
    CONSTRAINT uk_event_raffle_draw_picks_slot UNIQUE (draw_id, prize_slot_id),
    CONSTRAINT uk_event_raffle_draw_picks_user UNIQUE (draw_id, user_id),
    CONSTRAINT uk_event_raffle_draw_picks_ticket UNIQUE (draw_id, raffle_ticket_id),
    CONSTRAINT fk_event_raffle_draw_picks_draw_round
        FOREIGN KEY (draw_id, event_round_id, raffle_round_id)
        REFERENCES event_raffle_draws(id, event_round_id, raffle_round_id),
    CONSTRAINT fk_event_raffle_draw_picks_slot_round FOREIGN KEY (prize_slot_id, event_round_id)
        REFERENCES event_prize_slots(id, event_round_id),
    CONSTRAINT fk_event_raffle_draw_picks_ticket_owner
        FOREIGN KEY (raffle_ticket_id, raffle_round_id, user_id)
        REFERENCES raffle_tickets(id, round_id, user_id)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- Delivery is per prize, while contact submission remains per user and week.
-- One row means a manager has manually confirmed the actual handover.
CREATE TABLE event_prize_deliveries (
    winner_id BIGINT NOT NULL,
    delivered_by_user_id BIGINT NOT NULL,
    delivered_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_event_prize_deliveries PRIMARY KEY (winner_id),
    CONSTRAINT fk_event_prize_deliveries_winner FOREIGN KEY (winner_id)
        REFERENCES event_winners(id),
    CONSTRAINT fk_event_prize_deliveries_admin FOREIGN KEY (delivered_by_user_id)
        REFERENCES users(id),
    INDEX ix_event_prize_deliveries_admin_time (delivered_by_user_id, delivered_at)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

-- NULL for existing reply/reward notifications. One winner notification per
-- member/week; the application controls display when all prizes are delivered.
ALTER TABLE personal_notifications
    ADD COLUMN event_week_start_date DATE NULL,
    ADD CONSTRAINT uk_personal_notifications_event_week UNIQUE (user_id, event_week_start_date),
    ADD CONSTRAINT ck_personal_notifications_event_week CHECK (
        (type = 'EVENT_WINNER' AND event_week_start_date IS NOT NULL AND reply_id IS NULL)
        OR (type <> 'EVENT_WINNER' AND event_week_start_date IS NULL)
    );
