-- 테이블 대기: 착석(TABLE_JOINED) 뒤 그 사용자의 다음 테이블 이벤트가
-- 경기 시작이면 대기 성공, 떠남이면 시작 전 이탈로 본다. 다음 이벤트가 없으면 아직 대기 중이거나 기록이 끊긴 경우다.
SET time_zone = '+00:00';

WITH table_events AS (
    SELECT user_id,
           event_type,
           occurred_at,
           LEAD(event_type) OVER w AS next_type,
           LEAD(occurred_at) OVER w AS next_at,
           LEAD(props->>'$.byDisconnect') OVER w AS next_by_disconnect
    FROM behavior_events
    WHERE user_id IS NOT NULL AND event_type IN ('TABLE_JOINED', 'TABLE_LEFT', 'GAME_STARTED')
    WINDOW w AS (PARTITION BY user_id ORDER BY occurred_at, id)
)
SELECT COUNT(*) AS seatings,
       SUM(next_type = 'GAME_STARTED') AS started,
       SUM(next_type = 'TABLE_LEFT') AS left_before_start,
       SUM(next_type = 'TABLE_LEFT' AND next_by_disconnect = 'true') AS left_by_disconnect,
       SUM(next_type IS NULL) AS unresolved,
       ROUND(100 * SUM(next_type = 'TABLE_LEFT') / NULLIF(SUM(next_type IS NOT NULL), 0), 1) AS left_before_start_pct,
       ROUND(AVG(CASE WHEN next_type = 'GAME_STARTED'
                      THEN TIMESTAMPDIFF(SECOND, occurred_at, next_at) END), 1) AS avg_wait_seconds_started,
       ROUND(AVG(CASE WHEN next_type = 'TABLE_LEFT'
                      THEN TIMESTAMPDIFF(SECOND, occurred_at, next_at) END), 1) AS avg_wait_seconds_left
FROM table_events
WHERE event_type = 'TABLE_JOINED';
