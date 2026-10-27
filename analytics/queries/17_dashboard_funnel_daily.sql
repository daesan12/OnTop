-- 가입일(KST) 코호트별 채널 입장 → 착석 → 경기 시작 → 완주 인원.
-- 각 단계는 가입 이후 백업 시점까지 한 번이라도 도달했는지를 센다.
SET time_zone = '+00:00';

WITH onboarded AS (
    SELECT user_id, MIN(occurred_at) AS onboarded_at
    FROM behavior_events
    WHERE event_type = 'USER_ONBOARDED' AND user_id IS NOT NULL
    GROUP BY user_id
),
reached AS (
    SELECT DATE(o.onboarded_at + INTERVAL 9 HOUR) AS kst_date,
           o.user_id,
           COALESCE(MAX(e.event_type = 'CHANNEL_JOINED'), 0) AS channel_joined,
           COALESCE(MAX(e.event_type = 'TABLE_JOINED'), 0) AS table_joined,
           COALESCE(MAX(e.event_type = 'GAME_STARTED'), 0) AS game_started,
           COALESCE(MAX(e.event_type = 'GAME_ENDED' AND e.props->>'$.result' <> 'FORFEIT'), 0) AS game_completed
    FROM onboarded o
    LEFT JOIN behavior_events e ON e.user_id = o.user_id AND e.occurred_at >= o.onboarded_at
    GROUP BY o.user_id, kst_date
)
SELECT kst_date,
       COUNT(*) AS onboarded,
       SUM(channel_joined) AS channel_joined,
       SUM(table_joined) AS table_joined,
       SUM(game_started) AS game_started,
       SUM(game_completed) AS game_completed
FROM reached
GROUP BY kst_date
ORDER BY kst_date;
