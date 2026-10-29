-- 게임별 시작·종료 경기 수, 완주율, 평균 경기 시간(분), 참가자 기권 비율.
-- 경기 시간은 같은 game_id의 첫 GAME_STARTED와 GAME_ENDED 시각 차이다.
-- 시작 기록 없이 종료만 있는 경기(로그 켜기 전 시작)는 종료 수에만 포함된다.
SET time_zone = '+00:00';

WITH started AS (
    SELECT game_id, MIN(occurred_at) AS started_at, MIN(props->>'$.gameCode') AS game_code
    FROM behavior_events
    WHERE event_type = 'GAME_STARTED' AND game_id IS NOT NULL
    GROUP BY game_id
),
ended AS (
    SELECT game_id,
           MIN(occurred_at) AS ended_at,
           MIN(props->>'$.gameCode') AS game_code,
           COUNT(*) AS participants,
           SUM(props->>'$.result' = 'FORFEIT') AS forfeits
    FROM behavior_events
    WHERE event_type = 'GAME_ENDED' AND game_id IS NOT NULL
    GROUP BY game_id
),
games AS (
    SELECT game_id FROM started
    UNION
    SELECT game_id FROM ended
)
SELECT COALESCE(s.game_code, e.game_code) AS game_code,
       COUNT(s.game_id) AS games_started,
       COUNT(e.game_id) AS games_ended,
       ROUND(100 * SUM(s.game_id IS NOT NULL AND e.game_id IS NOT NULL) / NULLIF(COUNT(s.game_id), 0), 1)
           AS completion_pct,
       ROUND(AVG(TIMESTAMPDIFF(SECOND, s.started_at, e.ended_at)) / 60, 1) AS avg_minutes,
       ROUND(100 * SUM(e.forfeits) / NULLIF(SUM(e.participants), 0), 1) AS participant_forfeit_pct
FROM games g
LEFT JOIN started s ON s.game_id = g.game_id
LEFT JOIN ended e ON e.game_id = g.game_id
GROUP BY game_code
ORDER BY games_started DESC, game_code;
