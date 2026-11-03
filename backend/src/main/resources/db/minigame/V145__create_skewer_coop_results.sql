-- 사용자 재지정: V145는 꼬치왕 결과·보상 저장 (2026-11-04).
-- 지갑/원장은 기존 wallets·wallet_transactions를 사용한다. 기존 migration은 변경하지 않는다.
CREATE TABLE skewer_coop_results (
    game_id VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    result_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    rules_version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    table_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    team_low_id BIGINT NOT NULL,
    team_high_id BIGINT NOT NULL,
    chef_user_id BIGINT NULL,
    server_user_id BIGINT NULL,
    team_score INT NOT NULL,
    served INT NOT NULL,
    elapsed_ms BIGINT NOT NULL,
    duration_ms BIGINT NOT NULL,
    end_reason VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ranking_eligible BOOLEAN NOT NULL,
    ranking_reason VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ended_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_skewer_coop_results PRIMARY KEY (game_id),
    CONSTRAINT fk_skewer_coop_team_low FOREIGN KEY (team_low_id) REFERENCES users(id),
    CONSTRAINT fk_skewer_coop_team_high FOREIGN KEY (team_high_id) REFERENCES users(id),
    CONSTRAINT fk_skewer_coop_chef FOREIGN KEY (chef_user_id) REFERENCES users(id),
    CONSTRAINT fk_skewer_coop_server FOREIGN KEY (server_user_id) REFERENCES users(id),
    CONSTRAINT ck_skewer_coop_team CHECK (team_low_id > 0 AND team_high_id > team_low_id),
    CONSTRAINT ck_skewer_coop_score CHECK (team_score >= 0 AND served >= 0),
    CONSTRAINT ck_skewer_coop_time CHECK (duration_ms > 0 AND elapsed_ms >= 0 AND elapsed_ms <= duration_ms),
    CONSTRAINT ck_skewer_coop_ranking CHECK (ranking_eligible = FALSE OR (
        chef_user_id IS NOT NULL AND server_user_id IS NOT NULL AND chef_user_id <> server_user_id
        AND chef_user_id IN (team_low_id, team_high_id) AND server_user_id IN (team_low_id, team_high_id)
        AND end_reason = 'SKEWER_TIME_UP' AND ranking_reason = 'ELIGIBLE'
        AND rules_version = 'coop-v1' AND duration_ms = 240000)),
    INDEX ix_skewer_coop_ranking (rules_version, ranking_eligible, team_score DESC, ended_at),
    INDEX ix_skewer_coop_team (team_low_id, team_high_id, team_score DESC)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;

CREATE TABLE skewer_coop_rewards (
    game_id VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id BIGINT NOT NULL,
    player_role VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    coins_calculated INT NOT NULL,
    coins_granted INT NOT NULL,
    earned_at_settlement BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reward_date DATE NOT NULL,
    settled_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_skewer_coop_rewards PRIMARY KEY (game_id, user_id),
    CONSTRAINT fk_skewer_coop_reward_result FOREIGN KEY (game_id) REFERENCES skewer_coop_results(game_id),
    CONSTRAINT fk_skewer_coop_reward_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_skewer_coop_reward_amount CHECK (
        coins_calculated >= 0 AND coins_granted >= 0 AND coins_granted <= coins_calculated
        AND coins_granted <= 500 AND earned_at_settlement >= coins_granted AND balance_after >= 0),
    CONSTRAINT ck_skewer_coop_reward_role CHECK (player_role IN ('chef', 'server', 'unassigned')),
    INDEX ix_skewer_coop_reward_user (user_id, settled_at)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_bin;
