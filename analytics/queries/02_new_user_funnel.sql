-- 신규 가입자 퍼널: 가입 이후 각 단계에 한 번이라도 도달한 사용자 수와 가입자 대비 비율.
-- 경기 완주는 기권(FORFEIT)이 아닌 결과로 끝난 경기가 하나 이상 있는 경우다.
SET time_zone = '+00:00';

WITH onboarded AS (
    SELECT user_id, MIN(occurred_at) AS onboarded_at
    FROM behavior_events
    WHERE event_type = 'USER_ONBOARDED' AND user_id IS NOT NULL
    GROUP BY user_id
),
reached AS (
    SELECT o.user_id,
           COALESCE(MAX(e.event_type = 'CHANNEL_JOINED'), 0) AS channel_joined,
           COALESCE(MAX(e.event_type = 'TABLE_JOINED'), 0) AS table_joined,
           COALESCE(MAX(e.event_type = 'GAME_STARTED'), 0) AS game_started,
           COALESCE(MAX(e.event_type = 'GAME_ENDED' AND e.props->>'$.result' <> 'FORFEIT'), 0) AS game_completed
    FROM onboarded o
    LEFT JOIN behavior_events e ON e.user_id = o.user_id AND e.occurred_at >= o.onboarded_at
    GROUP BY o.user_id
),
steps AS (
    SELECT 1 AS step_order, 'onboarded' AS step, COUNT(*) AS users FROM reached
    UNION ALL SELECT 2, 'channel_joined', SUM(channel_joined) FROM reached
    UNION ALL SELECT 3, 'table_joined', SUM(table_joined) FROM reached
    UNION ALL SELECT 4, 'game_started', SUM(game_started) FROM reached
    UNION ALL SELECT 5, 'game_completed', SUM(game_completed) FROM reached
)
SELECT step_order,
       step,
       COALESCE(users, 0) AS users,
       ROUND(100 * COALESCE(users, 0) / NULLIF((SELECT COUNT(*) FROM reached), 0), 1) AS pct_of_onboarded
FROM steps
ORDER BY step_order;
