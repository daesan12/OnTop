-- 경기 시작일(KST)별 게임 수와 참가자 기권 수. 시작 기록이 없으면 종료일에 귀속한다.
-- 합산 가능한 정수만 발행해 기간별 비율을 화면에서 정확히 다시 계산한다.
SET time_zone = '+00:00';

WITH started AS (
    SELECT game_id, MIN(occurred_at) AS started_at, MIN(props->>'$.gameCode') AS game_code
    FROM behavior_events
    WHERE event_type = 'GAME_STARTED' AND game_id IS NOT NULL
    GROUP BY game_id
),
ended AS (
    SELECT game_id, MIN(occurred_at) AS ended_at, MIN(props->>'$.gameCode') AS game_code,
           COUNT(*) AS participants, SUM(props->>'$.result' = 'FORFEIT') AS forfeits
    FROM behavior_events
    WHERE event_type = 'GAME_ENDED' AND game_id IS NOT NULL
    GROUP BY game_id
),
games AS (
    SELECT game_id FROM started
    UNION
    SELECT game_id FROM ended
),
per_game AS (
    SELECT DATE(COALESCE(s.started_at, e.ended_at) + INTERVAL 9 HOUR) AS kst_date,
           COALESCE(s.game_code, e.game_code, 'UNKNOWN') AS game_code,
           s.game_id IS NOT NULL AS started,
           e.game_id IS NOT NULL AS ended,
           s.game_id IS NOT NULL AND e.game_id IS NOT NULL AS completed,
           COALESCE(e.forfeits, 0) AS forfeits,
           COALESCE(e.participants, 0) AS participants,
           CASE WHEN s.game_id IS NOT NULL AND e.game_id IS NOT NULL
                THEN GREATEST(0, TIMESTAMPDIFF(SECOND, s.started_at, e.ended_at))
                ELSE 0 END AS duration_seconds
    FROM games g
    LEFT JOIN started s ON s.game_id = g.game_id
    LEFT JOIN ended e ON e.game_id = g.game_id
)
SELECT kst_date, game_code,
       SUM(started) AS games_started, SUM(ended) AS games_ended,
       SUM(completed) AS games_completed,
       SUM(forfeits) AS forfeits, SUM(participants) AS participants,
       SUM(duration_seconds) AS duration_seconds, SUM(completed) AS timed_games
FROM per_game
GROUP BY kst_date, game_code
ORDER BY kst_date, game_code;
