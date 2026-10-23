-- 가입일(한국 날짜) 기준 재방문: 가입 다음 날(D1), 7일 뒤(D7)에 활동한 사용자 수.
-- 아직 D7이 오지 않은 가입일은 d7_users가 0으로 나오므로 해석에서 제외한다.
SET time_zone = '+00:00';

WITH signup AS (
    SELECT user_id, DATE(MIN(occurred_at) + INTERVAL 9 HOUR) AS cohort_date
    FROM behavior_events
    WHERE event_type = 'USER_ONBOARDED' AND user_id IS NOT NULL
    GROUP BY user_id
),
active AS (
    SELECT DISTINCT user_id, DATE(occurred_at + INTERVAL 9 HOUR) AS kst_date
    FROM behavior_events
    WHERE user_id IS NOT NULL
)
SELECT s.cohort_date,
       COUNT(DISTINCT s.user_id) AS users,
       COUNT(DISTINCT CASE WHEN a.kst_date = s.cohort_date + INTERVAL 1 DAY THEN s.user_id END) AS d1_users,
       COUNT(DISTINCT CASE WHEN a.kst_date = s.cohort_date + INTERVAL 7 DAY THEN s.user_id END) AS d7_users
FROM signup s
LEFT JOIN active a ON a.user_id = s.user_id
GROUP BY s.cohort_date
ORDER BY s.cohort_date;
