-- V110을 변경하지 않고 v2 재생 자료를 별도 보관한다. 공통 지갑/거래/세션 구조는 유지한다.
CREATE TABLE bungeoppang_records (
    minigame_session_id BIGINT NOT NULL PRIMARY KEY,
    rules_version VARCHAR(16) NOT NULL,
    heats TEXT NOT NULL,
    is_first_game BOOLEAN NOT NULL,
    submission MEDIUMTEXT NULL,
    result_json TEXT NULL,
    rejection_detail VARCHAR(64) NULL,
    rejection_index INT NULL,
    CONSTRAINT fk_bungeoppang_session FOREIGN KEY (minigame_session_id) REFERENCES minigame_sessions(id)
) ENGINE=InnoDB;

CREATE TABLE bungeoppang_profiles (
    user_id BIGINT NOT NULL PRIMARY KEY,
    seen_tips VARCHAR(128) NOT NULL DEFAULT '',
    CONSTRAINT fk_bungeoppang_profile_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 일일 지급 합계는 지갑 행 잠금 하에서 완료 세션을 조회한다. 별도 잔액 원본을 만들지 않는다.
CREATE INDEX ix_minigame_daily_reward ON minigame_sessions(user_id, status, ended_at);
