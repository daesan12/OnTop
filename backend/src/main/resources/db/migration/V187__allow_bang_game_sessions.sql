-- 사용자 지정 V187. 기존 게임 인원 계약과 participant 좌석 1~8 범위를 보존한다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'ALKKAGI') AND participant_count = 2)
        OR (game_code IN ('DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI')
            AND participant_count BETWEEN 2 AND 4)
        OR (game_code = 'STONE_RUMBLE' AND participant_count BETWEEN 2 AND 8)
        OR (game_code = 'BANG' AND participant_count BETWEEN 4 AND 7)
    );
