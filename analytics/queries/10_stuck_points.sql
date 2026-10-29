-- 막힘 지점: 같은 사용자의 연속된 이동 표본(약 1초 간격)인데 0.5m도 못 움직인 경우를 5m 격자로 모은다.
-- 정상 이동은 1초에 수 미터(걷기 6.25m/s, 수영 4m/s)라서, 많이 모이는 격자는 충돌·지형에 걸리는 곳일 가능성이 높다.
SET time_zone = '+00:00';

WITH samples AS (
    SELECT user_id,
           map_version,
           sampled_at,
           x,
           z,
           moving,
           LAG(x) OVER w AS previous_x,
           LAG(z) OVER w AS previous_z,
           LAG(sampled_at) OVER w AS previous_at,
           LAG(moving) OVER w AS previous_moving
    FROM world_position_samples
    WHERE user_id IS NOT NULL
    WINDOW w AS (PARTITION BY user_id ORDER BY sampled_at, id)
)
SELECT map_version,
       FLOOR(x / 5) * 5 AS cell_x,
       FLOOR(z / 5) * 5 AS cell_z,
       COUNT(*) AS stuck_samples,
       COUNT(DISTINCT user_id) AS users
FROM samples
WHERE moving = 1
  AND previous_moving = 1
  AND TIMESTAMPDIFF(MICROSECOND, previous_at, sampled_at) BETWEEN 500000 AND 1500000
  AND SQRT(POW(x - previous_x, 2) + POW(z - previous_z, 2)) < 0.5
GROUP BY map_version, cell_x, cell_z
ORDER BY stuck_samples DESC, cell_x, cell_z;
