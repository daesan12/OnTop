-- 사용자 지정 V186. V185의 기존 게임 인원 계약을 보존하고 길목 한 수의 2인/4인만 추가한다.
-- CHECK_CLAUSE의 이스케이프된 표현은 실행 SQL로 재사용하지 않는다.
-- 실패 이력이 있는 DB는 담당자가 실제 제약 상태를 확인한 뒤 정식 repair/migrate로 복구한다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'ALKKAGI') AND participant_count = 2)
        OR (game_code IN ('DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI',
                         'DAVINCI_CODE', 'RUMMIKUB') AND participant_count BETWEEN 2 AND 4)
        OR (game_code = 'STONE_RUMBLE' AND participant_count BETWEEN 2 AND 8)
        OR (game_code = 'QUORIDOR' AND participant_count IN (2, 4))
    );
