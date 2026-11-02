-- 맵 배치(layout)·구역별 방문자 수, 이동 표본 수, 멈춘 위치 수. 어느 구역에도 속하지 않으면 path(길·빈 공간)다.
-- 맵이 바뀌면 같은 좌표가 다른 장소가 되므로, 표본의 map_version을 아래 layouts 대응표로 배치에 연결한 뒤
-- 그 배치의 구역만 쓴다. 대응표에 없는 map_version은 잘못 섞지 않도록 unmapped로 따로 센다.
-- unmapped가 보이면 새 맵이 배포된 것이므로 그 map_version을 layouts에 추가한다(README "구역 수정").
--
-- legacy: 현재 운영 맵. 중심은 frontend/src/config의 PARK_ZONES·PARK_PAVILIONS·PICNIC_TABLES(2026-10-23 기준,
--         2026-10-30 재확인).
-- generated: 새 생성 맵(S15P31B105-273). 중심은 frontend/src/map/park/definition.ts(2026-10-30 기준).
--         돌탑 점프맵은 공원 위 공중을 지나가므로 높이(y) 5m 이상은 jump-course로 센다(전망대 제외).
-- 반경·크기는 분석용으로 정한 값이다. 구역 목록만 고치면 과거 좌표도 다시 집계된다.
-- 겹치는 곳은 priority가 작은 구역을 먼저 쓴다. ELLIPSE는 반지름 a(x)·b(z), RECT는 반폭 a(x)·반깊이 b(z)다.
-- min_y가 있으면 그 높이 이상인 표본만 해당한다.
-- 표본마다 구역을 찾으므로 행이 많으면 느리다. 운영 DB가 아닌 백업본에서 실행한다.
SET time_zone = '+00:00';

WITH layouts (map_version, layout) AS (
    VALUES
        ROW('544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0', 'legacy'),
        ROW('ae833248d2dd356c6603af72b2b865f9051a866e9cfa7d2b9c9abe890579944d', 'legacy'),
        ROW('cac3cb040a43630b0b40201ab089a4b328146c03211867b2a155d2b3614acc81', 'generated')
),
zones (layout, zone_id, shape, cx, cz, a, b, min_y, priority) AS (
    VALUES
        ROW('legacy', 'mailbox', 'ELLIPSE', -10.8, 14.5, 3.0, 3.0, NULL, 1),
        ROW('legacy', 'fish-bread-cart', 'ELLIPSE', -36.0, 13.0, 5.0, 5.0, NULL, 2),
        ROW('legacy', 'games-west', 'ELLIPSE', -10.0, 23.5, 6.0, 6.0, NULL, 3),
        ROW('legacy', 'games-east', 'ELLIPSE', 10.0, 23.5, 6.0, 6.0, NULL, 3),
        ROW('legacy', 'central-pavilion', 'ELLIPSE', 0.0, 6.0, 10.0, 10.0, NULL, 4),
        ROW('legacy', 'pagoda', 'ELLIPSE', 0.0, -36.0, 9.0, 9.0, NULL, 5),
        ROW('legacy', 'tower', 'ELLIPSE', 56.0, 50.0, 7.0, 7.0, NULL, 5),
        ROW('legacy', 'pavilion-p1', 'ELLIPSE', -18.0, 4.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'pavilion-p2', 'ELLIPSE', 18.0, 4.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'pavilion-p3', 'ELLIPSE', -18.0, -15.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'pavilion-p4', 'ELLIPSE', 18.0, -15.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'pavilion-p5', 'ELLIPSE', -18.0, -34.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'pavilion-p6', 'ELLIPSE', 18.0, -34.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'pavilion-p7', 'ELLIPSE', -23.0, 28.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'pavilion-p8', 'ELLIPSE', 23.0, 28.0, 6.5, 6.5, NULL, 6),
        ROW('legacy', 'picnic-northwest', 'ELLIPSE', -56.0, 57.0, 4.0, 4.0, NULL, 6),
        ROW('legacy', 'picnic-south', 'ELLIPSE', -23.0, -62.0, 4.0, 4.0, NULL, 6),
        ROW('legacy', 'picnic-northeast', 'ELLIPSE', 24.0, 61.0, 4.0, 4.0, NULL, 6),
        ROW('legacy', 'fountain-plaza', 'ELLIPSE', -56.0, -45.0, 14.0, 14.0, NULL, 7),
        ROW('legacy', 'vr-zone', 'RECT', -56.0, -7.0, 14.0, 12.0, NULL, 7),
        ROW('legacy', 'fitness', 'RECT', -56.0, 31.0, 14.0, 15.0, NULL, 7),
        ROW('legacy', 'lake', 'ELLIPSE', 56.0, -12.0, 20.0, 45.0, NULL, 8),

        ROW('generated', 'mailbox', 'ELLIPSE', -18.0, 18.0, 3.0, 3.0, NULL, 1),
        ROW('generated', 'fish-bread-cart', 'ELLIPSE', -51.0, 23.0, 5.0, 5.0, NULL, 2),
        ROW('generated', 'games-west', 'ELLIPSE', -12.0, 34.0, 6.0, 6.0, NULL, 3),
        ROW('generated', 'games-east', 'ELLIPSE', 12.0, 34.0, 6.0, 6.0, NULL, 3),
        ROW('generated', 'games-south-west', 'ELLIPSE', -12.0, 58.0, 6.0, 6.0, NULL, 3),
        ROW('generated', 'games-south-east', 'ELLIPSE', 12.0, 58.0, 6.0, 6.0, NULL, 3),
        ROW('generated', 'stone-table-17', 'ELLIPSE', -53.0, -8.0, 4.0, 4.0, NULL, 3),
        ROW('generated', 'stone-table-18', 'ELLIPSE', -53.0, 2.0, 4.0, 4.0, NULL, 3),
        ROW('generated', 'central-pavilion', 'ELLIPSE', 0.0, 6.0, 10.0, 10.0, NULL, 4),
        ROW('generated', 'pagoda', 'ELLIPSE', 0.0, -40.0, 9.0, 9.0, NULL, 5),
        ROW('generated', 'tower', 'ELLIPSE', 62.0, 56.0, 12.0, 12.0, NULL, 5),
        ROW('generated', 'jump-start', 'ELLIPSE', -53.0, -23.0, 8.0, 8.0, NULL, 5),
        ROW('generated', 'jump-course', 'RECT', 0.0, 0.0, 95.0, 95.0, 5.0, 6),
        ROW('generated', 'pavilion-p1', 'ELLIPSE', -28.0, 4.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'pavilion-p2', 'ELLIPSE', 28.0, 4.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'pavilion-p3', 'ELLIPSE', -24.0, -20.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'pavilion-p4', 'ELLIPSE', 24.0, -20.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'pavilion-p5', 'ELLIPSE', -24.0, -61.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'pavilion-p6', 'ELLIPSE', 24.0, -61.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'pavilion-p7', 'ELLIPSE', -24.0, 74.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'pavilion-p8', 'ELLIPSE', 24.0, 74.0, 6.5, 6.5, NULL, 7),
        ROW('generated', 'picnic-west', 'ELLIPSE', -73.0, 48.0, 4.0, 4.0, NULL, 7),
        ROW('generated', 'picnic-north', 'ELLIPSE', 48.0, -70.5, 4.0, 4.0, NULL, 7),
        ROW('generated', 'picnic-southeast', 'ELLIPSE', 71.0, 75.0, 4.0, 4.0, NULL, 7),
        ROW('generated', 'shop-kiosk', 'ELLIPSE', -29.5, 36.0, 6.0, 6.0, NULL, 7),
        ROW('generated', 'drink-kiosk', 'ELLIPSE', -30.0, 54.0, 5.0, 5.0, NULL, 7),
        ROW('generated', 'photo-kiosk', 'ELLIPSE', 30.0, 35.6, 5.0, 5.0, NULL, 7),
        ROW('generated', 'fountain-plaza', 'ELLIPSE', -63.0, -56.0, 14.0, 14.0, NULL, 8),
        ROW('generated', 'vr-zone', 'RECT', -63.0, -12.0, 20.0, 17.0, NULL, 8),
        ROW('generated', 'event-plaza', 'RECT', -64.0, 21.0, 16.0, 13.0, NULL, 8),
        ROW('generated', 'fitness', 'RECT', -63.0, 64.0, 16.0, 12.0, NULL, 8),
        ROW('generated', 'south-plaza', 'ELLIPSE', 0.0, 46.0, 24.0, 24.0, NULL, 8),
        ROW('generated', 'lake', 'ELLIPSE', 62.0, -14.0, 21.0, 46.0, NULL, 9)
),
assigned AS (
    SELECT COALESCE(l.layout, 'unmapped') AS layout,
           p.user_id,
           p.moving,
           CASE WHEN l.layout IS NULL THEN 'unmapped' ELSE COALESCE((
               SELECT zn.zone_id
               FROM zones zn
               WHERE zn.layout = l.layout
                 AND (zn.min_y IS NULL OR p.y >= zn.min_y)
                 AND ((zn.shape = 'ELLIPSE' AND POW((p.x - zn.cx) / zn.a, 2) + POW((p.z - zn.cz) / zn.b, 2) <= 1)
                   OR (zn.shape = 'RECT' AND ABS(p.x - zn.cx) <= zn.a AND ABS(p.z - zn.cz) <= zn.b))
               ORDER BY zn.priority, zn.zone_id
               LIMIT 1
           ), 'path') END AS zone_id
    FROM world_position_samples p
    LEFT JOIN layouts l ON l.map_version = p.map_version
)
SELECT layout,
       zone_id,
       COUNT(DISTINCT user_id) AS visitors,
       SUM(moving) AS moving_samples,
       SUM(NOT moving) AS stops
FROM assigned
GROUP BY layout, zone_id
ORDER BY layout, visitors DESC, moving_samples DESC, zone_id;
