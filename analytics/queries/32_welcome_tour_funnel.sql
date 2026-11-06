-- 첫 입장 체험 투어(ONBOARDING_STEP, flow=welcome_tour) 단계별 깔때기. 설명서의 다시 보기(replay)는 뺀다.
-- done_users: 그 단계를 마친 회원 수(start는 투어를 시작한 회원, finish는 모두 마친 회원).
-- abandoned_users: 그 단계를 하던 중 투어를 닫거나 공원을 떠난 회원 수. flight는 환영 비행 중 이탈이다.
-- 단계는 순서와 상관없이 마칠 수 있으므로 위 단계보다 아래 단계의 done_users가 클 수 있다.
-- 기록을 단계 키로 먼저 묶은 뒤 8개 단계에 붙인다. 기록이 없는 단계도 0으로 나온다.
SET time_zone = '+00:00';

WITH steps AS (
    SELECT 0 AS step_order, 'start' AS step
    UNION ALL SELECT 1, 'flight'
    UNION ALL SELECT 2, 'walk'
    UNION ALL SELECT 3, 'greet'
    UNION ALL SELECT 4, 'map'
    UNION ALL SELECT 5, 'minigame'
    UNION ALL SELECT 6, 'table'
    UNION ALL SELECT 7, 'finish'
),
first_run AS (
    SELECT user_id,
           JSON_UNQUOTE(JSON_EXTRACT(props, '$.action')) AS action,
           JSON_UNQUOTE(JSON_EXTRACT(props, '$.step')) AS step
    FROM behavior_events
    WHERE event_type = 'ONBOARDING_STEP' AND source = 'CLIENT' AND user_id IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(props, '$.flow')) = 'welcome_tour'
      AND JSON_UNQUOTE(JSON_EXTRACT(props, '$.replay')) = 'false'
),
done AS (
    SELECT CASE WHEN action IN ('start', 'finish') THEN action ELSE step END AS step,
           COUNT(DISTINCT user_id) AS users
    FROM first_run
    WHERE action IN ('start', 'finish', 'step_done')
    GROUP BY 1
),
abandoned AS (
    SELECT step, COUNT(DISTINCT user_id) AS users
    FROM first_run
    WHERE action = 'abandon'
    GROUP BY step
)
SELECT s.step_order,
       s.step,
       COALESCE(d.users, 0) AS done_users,
       COALESCE(a.users, 0) AS abandoned_users
FROM steps s
LEFT JOIN done d ON d.step = s.step
LEFT JOIN abandoned a ON a.step = s.step
ORDER BY s.step_order;
