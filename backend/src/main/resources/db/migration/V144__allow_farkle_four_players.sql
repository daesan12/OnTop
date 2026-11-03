-- 사용자 재지정 V144: 주사위 2~4인 확장. 로컬 전용이며 원격 반영은 보류한다.
-- DICE만 2~4인으로 확장하고 기존 게임의 참가 인원 제한은 보존한다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'ALKKAGI') AND participant_count = 2)
        OR (game_code IN ('DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI')
            AND participant_count BETWEEN 2 AND 4)
    );
