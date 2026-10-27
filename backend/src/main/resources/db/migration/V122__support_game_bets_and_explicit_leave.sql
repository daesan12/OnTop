-- V112의 기존 행과 예약 이력은 보존한다. 양수 참가비는 경기 시작 시 불변 스냅샷으로 저장한다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_pot,
    ADD CONSTRAINT ck_game_sessions_pot CHECK (
        bet_amount_per_player > 0 AND total_pot = bet_amount_per_player * participant_count
    );

ALTER TABLE game_participants
    DROP CHECK ck_game_participants_reserved,
    ADD CONSTRAINT ck_game_participants_reserved CHECK (reserved_amount > 0),
    DROP CHECK ck_game_participants_departure,
    ADD CONSTRAINT ck_game_participants_departure CHECK (
        (leave_reason IS NULL AND left_at IS NULL)
        OR (leave_reason IS NOT NULL AND left_at IS NOT NULL
            AND leave_reason IN ('LOGOUT', 'MEMBER_DEACTIVATED', 'DISCONNECT_TIMEOUT', 'EXPLICIT_LEAVE'))
    );
