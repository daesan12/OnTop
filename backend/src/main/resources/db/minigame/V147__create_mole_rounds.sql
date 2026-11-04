-- 두더지 잡기 한 판. START에 시드를 정하고, 완료 때 서버가 타격 기록을 다시 계산해 점수·지급을 한 행에 확정한다.
-- 명시적으로 db/minigame을 Flyway locations에 추가한 환경에만 적용한다. 공통 users/wallets는 재사용한다.
CREATE TABLE mole_rounds (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- 출현표 시드. 규칙(MoleRules)과 rules_version으로 같은 출현표를 다시 만든다.
    seed BIGINT NOT NULL,
    rules_version TINYINT NOT NULL,
    status VARCHAR(8) NOT NULL,
    started_at TIMESTAMP(3) NOT NULL,
    settled_at TIMESTAMP(3) NULL,
    score INT NULL,
    max_combo INT NULL,
    caught INT NULL,
    -- 30점당 1냥으로 계산한 값과, 미니게임 공통 하루 상한을 적용해 실제로 지급한 값.
    calculated_reward INT NULL,
    reward INT NULL,
    CONSTRAINT fk_mole_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT uk_mole_request UNIQUE (user_id, request_key),
    CONSTRAINT ck_mole_status CHECK ((status = 'ACTIVE' AND settled_at IS NULL AND score IS NULL AND reward IS NULL)
        OR (status = 'EXPIRED' AND settled_at IS NOT NULL AND score IS NULL AND reward IS NULL)
        OR (status = 'SETTLED' AND settled_at IS NOT NULL AND score >= 0 AND max_combo >= 0 AND caught >= 0
            AND calculated_reward = score DIV 30 AND reward BETWEEN 0 AND calculated_reward)),
    INDEX ix_mole_user_status (user_id, status),
    INDEX ix_mole_user_score (user_id, score)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
