-- 데이터 품질: 한국 시간 1시간 단위 이벤트·사용자·좌표 수.
-- 다른 시간대와 비교해 갑자기 0이 되는 구간은 서버 중단이나 로그 유실을 의심한다.
-- 사용자 없는 이벤트(local 개발 사용자)는 user_events에서 빠진다.
SET time_zone = '+00:00';

WITH events AS (
    SELECT DATE_FORMAT(occurred_at + INTERVAL 9 HOUR, '%Y-%m-%d %H:00') AS kst_hour,
           COUNT(*) AS events,
           COUNT(user_id) AS user_events,
           COUNT(DISTINCT user_id) AS users
    FROM behavior_events
    GROUP BY kst_hour
),
positions AS (
    SELECT DATE_FORMAT(sampled_at + INTERVAL 9 HOUR, '%Y-%m-%d %H:00') AS kst_hour,
           COUNT(*) AS position_rows
    FROM world_position_samples
    GROUP BY kst_hour
),
hours AS (
    SELECT kst_hour FROM events
    UNION
    SELECT kst_hour FROM positions
)
SELECT h.kst_hour,
       COALESCE(e.events, 0) AS events,
       COALESCE(e.user_events, 0) AS user_events,
       COALESCE(e.users, 0) AS users,
       COALESCE(p.position_rows, 0) AS position_rows
FROM hours h
LEFT JOIN events e ON e.kst_hour = h.kst_hour
LEFT JOIN positions p ON p.kst_hour = h.kst_hour
ORDER BY h.kst_hour;
