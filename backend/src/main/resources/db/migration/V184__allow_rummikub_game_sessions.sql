-- 사용자 지정 V184. 병렬 개발 중인 V183의 DAVINCI_CODE 허용 조건도 보존한다.
-- 기존 V180 기준에도 적용 가능하며 DB 적용은 담당 환경의 정식 Flyway 절차를 따른다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'ALKKAGI') AND participant_count = 2)
        OR (game_code IN ('DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI',
                         'DAVINCI_CODE', 'RUMMIKUB') AND participant_count BETWEEN 2 AND 4)
        OR (game_code = 'STONE_RUMBLE' AND participant_count BETWEEN 2 AND 8)
    );
