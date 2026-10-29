-- 접속 시간: 접속(WS_CONNECTED)과 바로 다음 종료(WS_DISCONNECTED)를 짝지어 한국 날짜별 평균·중앙값(분).
-- 회원당 동시 접속은 하나라서 순서대로 짝지을 수 있다. 종료 기록이 없는 접속(서버 강제 종료 등)은 빠진다.
SET time_zone = '+00:00';

WITH connection_events AS (
    SELECT user_id,
           event_type,
           occurred_at,
           LEAD(event_type) OVER w AS next_type,
           LEAD(occurred_at) OVER w AS next_at
    FROM behavior_events
    WHERE user_id IS NOT NULL AND event_type IN ('WS_CONNECTED', 'WS_DISCONNECTED')
    WINDOW w AS (PARTITION BY user_id ORDER BY occurred_at, id)
),
sessions AS (
    SELECT user_id,
           DATE(occurred_at + INTERVAL 9 HOUR) AS kst_date,
           TIMESTAMPDIFF(SECOND, occurred_at, next_at) AS seconds
    FROM connection_events
    WHERE event_type = 'WS_CONNECTED' AND next_type = 'WS_DISCONNECTED'
),
ranked AS (
    SELECT kst_date,
           user_id,
           seconds,
           ROW_NUMBER() OVER (PARTITION BY kst_date ORDER BY seconds) AS row_no,
           COUNT(*) OVER (PARTITION BY kst_date) AS session_count
    FROM sessions
)
SELECT kst_date,
       MAX(session_count) AS sessions,
       COUNT(DISTINCT user_id) AS users,
       ROUND(AVG(seconds) / 60, 1) AS avg_minutes,
       ROUND(AVG(CASE WHEN row_no IN (FLOOR((session_count + 1) / 2), CEIL((session_count + 1) / 2))
                      THEN seconds END) / 60, 1) AS median_minutes
FROM ranked
GROUP BY kst_date
ORDER BY kst_date;
