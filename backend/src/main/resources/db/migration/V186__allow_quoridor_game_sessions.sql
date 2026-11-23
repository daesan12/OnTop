-- 사용자 지정 V186. 병행 작업 V183/V184 등 먼저 적용된 게임 인원 계약도 그대로 보존한다.
-- 기존 제약이 없으면 PREPARE가 실패하므로 잘못된 스키마를 임의로 허용하지 않는다.
SET @quoridor_previous_check = (
    SELECT CHECK_CLAUSE
    FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'ck_game_sessions_players'
);
SET @quoridor_check_ddl = CONCAT(
    'ALTER TABLE game_sessions DROP CHECK ck_game_sessions_players, ',
    'ADD CONSTRAINT ck_game_sessions_players CHECK ((', @quoridor_previous_check,
    ') OR (game_code = ''QUORIDOR'' AND participant_count IN (2, 4)))'
);
PREPARE quoridor_check_update FROM @quoridor_check_ddl;
EXECUTE quoridor_check_update;
DEALLOCATE PREPARE quoridor_check_update;
SET @quoridor_previous_check = NULL;
SET @quoridor_check_ddl = NULL;
