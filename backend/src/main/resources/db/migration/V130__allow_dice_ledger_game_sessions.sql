-- 주사위 장부(DICE_LEDGER, 2~4인)를 기존 game_sessions에 연결한다.
-- 기존 행·컬럼·다른 제약은 그대로 두고, 참가 인원 CHECK에 새 게임 코드만 추가한다.
-- target_score 제약은 DICE 외 게임에 NULL을 요구하므로 변경하지 않는다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'DICE') AND participant_count = 2)
        OR (game_code IN ('ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER') AND participant_count BETWEEN 2 AND 4)
    );
