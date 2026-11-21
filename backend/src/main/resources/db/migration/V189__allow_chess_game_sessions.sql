-- 체스는 기존 예약·종료·정산 저장 경로를 사용하는 2인 게임이다.
-- V187 등 앞선 migration이 추가한 게임/정원을 보존하고 체스 조건만 확장한다.
SET @ontop_chess_previous_players_check = (
    SELECT CHECK_CLAUSE
    FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'ck_game_sessions_players'
);
SET @ontop_chess_extend_players_sql = CONCAT(
    'ALTER TABLE game_sessions DROP CHECK ck_game_sessions_players, ',
    'ADD CONSTRAINT ck_game_sessions_players CHECK ((',
    @ontop_chess_previous_players_check,
    ') OR (game_code = ''CHESS'' AND participant_count = 2))'
);
PREPARE ontop_chess_extend_players FROM @ontop_chess_extend_players_sql;
EXECUTE ontop_chess_extend_players;
DEALLOCATE PREPARE ontop_chess_extend_players;
SET @ontop_chess_previous_players_check = NULL;
SET @ontop_chess_extend_players_sql = NULL;
