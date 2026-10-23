-- 구역별 방문자 수, 이동 표본 수, 멈춘 위치 수. 어느 구역에도 속하지 않으면 path(길·빈 공간)다.
-- 구역 중심은 frontend/src/config의 PARK_ZONES·PARK_PAVILIONS·PICNIC_TABLES 좌표(2026-10-23 기준)이고,
-- 반경·크기는 분석용으로 정한 값이다. 맵이 바뀌면 이 목록만 고치면 과거 좌표도 다시 집계된다.
-- 겹치는 곳은 priority가 작은 구역을 먼저 쓴다. ELLIPSE는 반지름 a(x)·b(z), RECT는 반폭 a(x)·반깊이 b(z)다.
-- 표본마다 구역을 찾으므로 행이 많으면 느리다. 운영 DB가 아닌 백업본에서 실행한다.
SET time_zone = '+00:00';

WITH zones (zone_id, shape, cx, cz, a, b, priority) AS (
    VALUES
        ROW('mailbox', 'ELLIPSE', -10.8, 14.5, 3.0, 3.0, 1),
        ROW('fish-bread-cart', 'ELLIPSE', -36.0, 13.0, 5.0, 5.0, 2),
        ROW('games-west', 'ELLIPSE', -10.0, 23.5, 6.0, 6.0, 3),
        ROW('games-east', 'ELLIPSE', 10.0, 23.5, 6.0, 6.0, 3),
        ROW('central-pavilion', 'ELLIPSE', 0.0, 6.0, 10.0, 10.0, 4),
        ROW('pagoda', 'ELLIPSE', 0.0, -36.0, 9.0, 9.0, 5),
        ROW('tower', 'ELLIPSE', 56.0, 50.0, 7.0, 7.0, 5),
        ROW('pavilion-p1', 'ELLIPSE', -18.0, 4.0, 6.5, 6.5, 6),
        ROW('pavilion-p2', 'ELLIPSE', 18.0, 4.0, 6.5, 6.5, 6),
        ROW('pavilion-p3', 'ELLIPSE', -18.0, -15.0, 6.5, 6.5, 6),
        ROW('pavilion-p4', 'ELLIPSE', 18.0, -15.0, 6.5, 6.5, 6),
        ROW('pavilion-p5', 'ELLIPSE', -18.0, -34.0, 6.5, 6.5, 6),
        ROW('pavilion-p6', 'ELLIPSE', 18.0, -34.0, 6.5, 6.5, 6),
        ROW('pavilion-p7', 'ELLIPSE', -23.0, 28.0, 6.5, 6.5, 6),
        ROW('pavilion-p8', 'ELLIPSE', 23.0, 28.0, 6.5, 6.5, 6),
        ROW('picnic-northwest', 'ELLIPSE', -56.0, 57.0, 4.0, 4.0, 6),
        ROW('picnic-south', 'ELLIPSE', -23.0, -62.0, 4.0, 4.0, 6),
        ROW('picnic-northeast', 'ELLIPSE', 24.0, 61.0, 4.0, 4.0, 6),
        ROW('fountain-plaza', 'ELLIPSE', -56.0, -45.0, 14.0, 14.0, 7),
        ROW('vr-zone', 'RECT', -56.0, -7.0, 14.0, 12.0, 7),
        ROW('fitness', 'RECT', -56.0, 31.0, 14.0, 15.0, 7),
        ROW('lake', 'ELLIPSE', 56.0, -12.0, 20.0, 45.0, 8)
),
assigned AS (
    SELECT p.user_id,
           p.moving,
           COALESCE((
               SELECT zn.zone_id
               FROM zones zn
               WHERE (zn.shape = 'ELLIPSE' AND POW((p.x - zn.cx) / zn.a, 2) + POW((p.z - zn.cz) / zn.b, 2) <= 1)
                  OR (zn.shape = 'RECT' AND ABS(p.x - zn.cx) <= zn.a AND ABS(p.z - zn.cz) <= zn.b)
               ORDER BY zn.priority, zn.zone_id
               LIMIT 1
           ), 'path') AS zone_id
    FROM world_position_samples p
)
SELECT zone_id,
       COUNT(DISTINCT user_id) AS visitors,
       SUM(moving) AS moving_samples,
       SUM(NOT moving) AS stops
FROM assigned
GROUP BY zone_id
ORDER BY visitors DESC, moving_samples DESC, zone_id;
