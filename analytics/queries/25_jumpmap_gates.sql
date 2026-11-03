-- 코스 버전·구간별 점프맵 도달 수와 직전 구간 대비 이탈 수. 끝난 도전(ENDED) 중 의심 판을 뺀 것만 센다.
-- gate 0은 출발(전체 도전 수), gate 1 이상은 그 구간 문을 통과한 도전 수다(jump_runs.gates_passed >= gate).
-- lost_from_previous가 큰 구간이 가장 많이 떨어지는 곳이다. 막힘 지점(10번)과 함께 맵 담당에게 전달한다.
-- 코스가 바뀌면 구간 의미와 구간 수가 달라질 수 있으므로 course_version별로 나눈다.
-- 구간 번호는 고정하지 않고 코스마다 0부터 그 코스에서 실제로 기록된 최대 통과 구간까지 만든다.
-- 그래서 아무도 닿지 못한 마지막 구간(들)은 행이 없다. 코스의 전체 구간 수는 서버 코스 정의로 확인한다.
SET time_zone = '+00:00';

WITH RECURSIVE runs AS (
    SELECT course_version, gates_passed
    FROM jump_runs
    WHERE status = 'ENDED' AND NOT suspicious
),
courses AS (
    SELECT course_version, MAX(gates_passed) AS max_gate, COUNT(*) AS runs_started
    FROM runs
    GROUP BY course_version
),
gates (gate) AS (
    SELECT 0
    UNION ALL
    SELECT gate + 1 FROM gates WHERE gate < (SELECT MAX(max_gate) FROM courses)
),
reached AS (
    SELECT c.course_version,
           g.gate,
           SUM(r.gates_passed >= g.gate) AS runs_reached,
           c.runs_started
    FROM courses c
    JOIN gates g ON g.gate <= c.max_gate
    JOIN runs r ON r.course_version = c.course_version
    GROUP BY c.course_version, g.gate, c.runs_started
)
SELECT course_version,
       gate,
       runs_reached,
       ROUND(100 * runs_reached / runs_started, 1) AS reached_pct,
       COALESCE(LAG(runs_reached) OVER (PARTITION BY course_version ORDER BY gate) - runs_reached, 0)
           AS lost_from_previous
FROM reached
ORDER BY course_version, gate;
