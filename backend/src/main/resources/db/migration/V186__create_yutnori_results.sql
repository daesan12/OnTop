-- 무료 윷놀이 종료 기록. 지갑·예약·공통 판돈 세션을 변경하지 않는다.
CREATE TABLE yutnori_results (
    game_id VARCHAR(64) NOT NULL,
    channel_id VARCHAR(64) NOT NULL,
    winner_team TINYINT NOT NULL,
    end_reason VARCHAR(40) NOT NULL,
    result_json JSON NOT NULL,
    ended_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (game_id),
    CONSTRAINT ck_yutnori_winner_team CHECK (winner_team IN (-1, 0, 1)),
    INDEX ix_yutnori_ended (ended_at)
);
