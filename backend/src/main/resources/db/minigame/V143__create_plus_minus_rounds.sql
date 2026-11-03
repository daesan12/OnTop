-- 더하기 빼기 아케이드 한 판. START 한 번에 참가비 차감·세 릴 칸·지급을 한 행으로 확정한다.
-- 명시적으로 db/minigame을 Flyway locations에 추가한 환경에만 적용한다. 공통 users/wallets는 재사용한다.
CREATE TABLE plus_minus_rounds (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    fee INT NOT NULL,
    play_date DATE NOT NULL,
    -- 릴 칸 번호. 칸 값은 서버 규칙(PlusMinusRules)의 릴 배열에서 읽는다.
    first_cell TINYINT NOT NULL,
    operator_cell TINYINT NOT NULL,
    second_cell TINYINT NOT NULL,
    -- JACKPOT 칸이면 계산식이 없으므로 NULL이다.
    result_value INT NULL,
    outcome VARCHAR(8) NOT NULL,
    payout INT NOT NULL,
    played_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT fk_plus_minus_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT uk_plus_minus_request UNIQUE (user_id, request_key),
    CONSTRAINT ck_plus_minus_fee CHECK (fee = 30),
    CONSTRAINT ck_plus_minus_cells CHECK (first_cell BETWEEN 0 AND 15 AND operator_cell BETWEEN 0 AND 7
        AND second_cell BETWEEN 0 AND 15),
    CONSTRAINT ck_plus_minus_outcome CHECK ((outcome = 'LOST' AND payout = 0)
        OR (outcome = 'PAID' AND result_value IS NOT NULL AND payout = result_value * 10)
        OR (outcome = 'JACKPOT' AND result_value IS NULL AND payout = 500)),
    CONSTRAINT ck_plus_minus_payout CHECK (payout BETWEEN 0 AND 500),
    INDEX ix_plus_minus_user_date (user_id, play_date)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
