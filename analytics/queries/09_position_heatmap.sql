-- 위치 히트맵: 5m 격자별 이동 표본 수(통행량), 멈춘 위치 수, 사용자 수.
-- 이동 중에는 1초마다, 멈추면 한 번만 기록하므로 moving_samples는 "지나다닌 양", stops는 "멈춘 곳"이다.
-- 맵이 바뀌면 좌표 의미가 달라지므로 map_version별로 나눈다. cell_x·cell_z는 격자의 서쪽·북쪽 모서리다.
SET time_zone = '+00:00';

SELECT map_version,
       FLOOR(x / 5) * 5 AS cell_x,
       FLOOR(z / 5) * 5 AS cell_z,
       SUM(moving) AS moving_samples,
       SUM(NOT moving) AS stops,
       COUNT(DISTINCT user_id) AS users
FROM world_position_samples
GROUP BY map_version, cell_x, cell_z
ORDER BY moving_samples DESC, stops DESC, cell_x, cell_z;
