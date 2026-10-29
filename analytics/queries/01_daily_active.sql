-- 한국 날짜별 활성 사용자, 신규 가입자, 접속 수, 경기에 참여한 사용자.
-- 활성 사용자: 그날 회원 번호가 있는 이벤트를 하나라도 남긴 사용자.
SET time_zone = '+00:00';

SELECT DATE(occurred_at + INTERVAL 9 HOUR) AS kst_date,
       COUNT(DISTINCT user_id) AS active_users,
       COUNT(DISTINCT CASE WHEN event_type = 'USER_ONBOARDED' THEN user_id END) AS new_users,
       SUM(event_type = 'WS_CONNECTED') AS connections,
       COUNT(DISTINCT CASE WHEN event_type = 'GAME_STARTED' THEN user_id END) AS players
FROM behavior_events
WHERE user_id IS NOT NULL
GROUP BY kst_date
ORDER BY kst_date;
