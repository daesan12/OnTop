-- 코스 버전·구간별 점프맵 도달 수와 직전 구간 대비 이탈 수. 끝난 도전(ENDED) 중 의심 판을 뺀 것만 센다.
-- gate 0은 출발(전체 도전 수), gate 1~7은 그 구간 문을 통과한 도전 수다(jump_runs.gates_passed >= gate).
-- lost_from_previous가 큰 구간이 가장 많이 떨어지는 곳이다. 막힘 지점(10번)과 함께 맵 담당에게 전달한다.
-- 코스가 바뀌면 구간 의미가 달라지므로 course_version별로 나눈다.
SET time_zone = '+00:00';

WITH runs AS (
    SELECT course_version, gates_passed
    FROM jump_runs
    WHERE status = 'ENDED' AND NOT suspicious
),
gates (gate) AS (
    VALUES ROW(0), ROW(1), ROW(2), ROW(3), ROW(4), ROW(5), ROW(6), ROW(7)
),
reached AS (
    SELECT r.course_version,
           g.gate,
           SUM(r.gates_passed >= g.gate) AS runs_reached,
           COUNT(*) AS runs_started
    FROM runs r
    CROSS JOIN gates g
    GROUP BY r.course_version, g.gate
)
SELECT course_version,
       gate,
       runs_reached,
       ROUND(100 * runs_reached / runs_started, 1) AS reached_pct,
       COALESCE(LAG(runs_reached) OVER (PARTITION BY course_version ORDER BY gate) - runs_reached, 0)
           AS lost_from_previous
FROM reached
ORDER BY course_version, gate;
