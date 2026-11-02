-- V138은 꼬치왕 작업에서 사용한다. 기존 경기와 예약 이력은 보존한다.
ALTER TABLE game_sessions
    DROP CHECK ck_game_sessions_pot,
    ADD CONSTRAINT ck_game_sessions_pot CHECK (
        bet_amount_per_player >= 0 AND total_pot = bet_amount_per_player * participant_count
    );

ALTER TABLE game_participants
    DROP CHECK ck_game_participants_reserved,
    ADD CONSTRAINT ck_game_participants_reserved CHECK (reserved_amount >= 0);
