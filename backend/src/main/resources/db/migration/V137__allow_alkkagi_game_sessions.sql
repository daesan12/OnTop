-- 알까기는 2인 경기다. 기존 경기·판돈·지갑 행은 변경하지 않는다.
-- V135의 할리갈리 참가 인원 제약을 보존하면서 ALKKAGI만 추가한다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'DICE', 'ALKKAGI') AND participant_count = 2)
        OR (game_code IN ('ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI') AND participant_count BETWEEN 2 AND 4)
    );
