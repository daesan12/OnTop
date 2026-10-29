-- 공통 users/wallets/wallet_transactions는 담당자의 스키마를 재사용한다.
-- 명시적으로 db/minigame을 Flyway locations에 추가한 환경에만 적용한다.
CREATE TABLE minigame_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    minigame_type VARCHAR(40) NOT NULL,
    status VARCHAR(24) NOT NULL,
    score BIGINT NULL,
    reward_amount BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMP(3) NOT NULL,
    ended_at TIMESTAMP(3) NULL,
    CONSTRAINT fk_minigame_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_minigame_type CHECK (minigame_type = 'BUNGEOPPANG'),
    CONSTRAINT ck_minigame_status CHECK (status IN ('PLAYING', 'COMPLETED', 'ABANDONED', 'INVALID')),
    CONSTRAINT ck_minigame_reward CHECK (reward_amount >= 0),
    INDEX ix_minigame_user_started (user_id, started_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- ERD의 플레이 세션과 별개인 시작 요청 멱등성 영수증.
CREATE TABLE minigame_start_requests (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    minigame_session_id BIGINT NOT NULL,
    CONSTRAINT uk_minigame_start_key UNIQUE (user_id, request_key),
    CONSTRAINT fk_minigame_request_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_minigame_request_session FOREIGN KEY (minigame_session_id) REFERENCES minigame_sessions(id)
) ENGINE=InnoDB;
