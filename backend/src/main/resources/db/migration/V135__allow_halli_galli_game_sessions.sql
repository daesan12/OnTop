-- 할리갈리(HALLI_GALLI, 2~4인)를 기존 game_sessions에 연결한다.
-- V130의 참가 인원 CHECK 전체를 그대로 다시 만들고 새 게임 코드만 추가한다. 기존 행·컬럼·다른 제약은 그대로 둔다.
-- target_score 제약은 DICE 외 게임에 NULL을 요구하므로 변경하지 않는다. 경기 상태는 엔진 메모리에 있어 전용 테이블이 없다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'DICE') AND participant_count = 2)
        OR (game_code IN ('ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI') AND participant_count BETWEEN 2 AND 4)
    );
