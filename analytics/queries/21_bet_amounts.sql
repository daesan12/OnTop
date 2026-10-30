-- 게임별 판돈(1인 참가비) 분포. 행동 로그 GAME_STARTED의 betAmountPerPlayer(확정 경기에서 1인당 예약한 금액)를 쓴다.
-- GAME_STARTED는 참가자마다 한 행이므로 경기(game_id)별로 한 번만 센다. 판 총액은 참가비 × 참가자 수다.
-- 대부분 최소 금액이면 판돈 기능이 거의 쓰이지 않는 것이고, 최대가 크게 튀면 잔액 쏠림(20번)과 함께 본다.
WITH games AS (
    SELECT game_id,
           MIN(props->>'$.gameCode') AS game_code,
           MIN(CAST(props->>'$.betAmountPerPlayer' AS SIGNED)) AS bet,
           MIN(CAST(props->>'$.players' AS SIGNED)) AS players
    FROM behavior_events
    WHERE event_type = 'GAME_STARTED' AND game_id IS NOT NULL
    GROUP BY game_id
)
SELECT game_code,
       COUNT(*) AS games,
       MIN(bet) AS min_bet,
       ROUND(AVG(bet), 1) AS avg_bet,
       MAX(bet) AS max_bet,
       ROUND(AVG(bet * players), 1) AS avg_pot
FROM games
GROUP BY game_code
ORDER BY games DESC, game_code;
