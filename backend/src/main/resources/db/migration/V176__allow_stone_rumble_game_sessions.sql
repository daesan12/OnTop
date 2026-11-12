-- 기존 V144의 게임별 참가 인원 계약을 보존한다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_players,
    ADD CONSTRAINT ck_game_sessions_players CHECK (
        (game_code IN ('OMOK', 'ALKKAGI') AND participant_count = 2)
        OR (game_code IN ('DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI')
            AND participant_count BETWEEN 2 AND 4)
        OR (game_code = 'STONE_RUMBLE' AND participant_count BETWEEN 2 AND 8)
    );

-- 게임별 정원은 시작 요청에서 검증한다. 참가자 테이블에는 game_code가 없으므로 공통 저장 범위만 확장한다.
ALTER TABLE game_participants
    DROP CHECK ck_game_participants_seat,
    DROP CHECK ck_game_participants_order,
    ADD CONSTRAINT ck_game_participants_seat CHECK (seat_number BETWEEN 1 AND 8),
    ADD CONSTRAINT ck_game_participants_order CHECK (participant_order BETWEEN 0 AND 7);

-- 돌탑의 확정 순위와 서버 발행 보상을 판정 커밋에 보존한다. 다른 게임/무효 경기는 NULL이다.
ALTER TABLE game_participants
    ADD COLUMN finish_rank SMALLINT NULL,
    ADD COLUMN rank_reward BIGINT NULL,
    ADD CONSTRAINT ck_game_participants_rank_reward CHECK (
        (finish_rank IS NULL AND rank_reward IS NULL)
        OR (finish_rank IS NOT NULL AND rank_reward IS NOT NULL
            AND finish_rank BETWEEN 1 AND 8 AND rank_reward BETWEEN 10 AND 80
            AND MOD(rank_reward, 5) = 0)
    );
