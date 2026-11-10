-- 맵 배치(layout)·구역별 방문자 수, 이동 표본 수, 멈춘 위치 수. 어느 구역에도 속하지 않으면 path(길·빈 공간)다.
-- 맵이 바뀌면 같은 좌표가 다른 장소가 되므로, 표본의 map_version을 아래 layouts 대응표로 배치에 연결한 뒤
-- 그 배치의 구역만 쓴다. 대응표에 없는 map_version은 잘못 섞지 않도록 unmapped로 따로 센다.
-- unmapped가 보이면 새 맵이 배포된 것이므로 그 map_version을 layouts에 추가한다(README "구역 수정").
--
-- legacy: 현재 운영 맵. 중심은 frontend/src/config의 PARK_ZONES·PARK_PAVILIONS·PICNIC_TABLES(2026-10-23 기준,
--         2026-10-30 재확인).
-- generated: 새 생성 맵(S15P31B105-273). 중심은 frontend/src/map/park/definition.ts(2026-11-03 기준).
--         11/03 후보에서 붕어빵 카트·소리함·음료 매점이 옮겨지고 사진 매대 자리가 랭킹 보드가 됐다.
--         가위바위보 룰렛 게임기는 붕어빵 카트 바로 옆이라 fish-bread-cart 구역에 함께 센다.
--         이전 후보(cac3cb04…·04350122…)는 DEV·운영에 배포되지 않았으므로 같은 최신 좌표로 본다.
--         돌탑 점프맵은 공원 위 공중을 지나가므로 높이(y) 5m 이상은 jump-course로 센다(전망대 제외).
-- renewal: 220m 새 공원(!492, 2026-11-10 DEV 전환). 중심·반경은 frontend/src/park-renewal/plan.ts의 SITES다.
--         맵 버전은 DEV 공개 release.json의 mapVersion이며, 운영 전환 때 새 버전이 생기면 한 줄 추가한다.
--         공사 중 시설(카페·사격장·비둘기·민속놀이·운세·낚시·선착장·열기구·킥보드)도 사람들이 들르는지 보려고 구역으로 둔다.
--         10단계 점프 코스는 언덕(+22m)과 호수 위를 가로질러 높이로 가를 수 없다. 그래서 그 회원의 점프맵 도전
--         (jump_runs 시작~종료, 진행 중이면 시작 후 30분) 동안의 표본은 위치와 상관없이 jump-course로 센다.
-- 반경·크기는 분석용으로 정한 값이다. 구역 목록만 고치면 과거 좌표도 다시 집계된다.
-- 겹치는 곳은 priority가 작은 구역을 먼저 쓴다. ELLIPSE는 반지름 a(x)·b(z), RECT는 반폭 a(x)·반깊이 b(z)다.
-- min_y가 있으면 그 높이 이상인 표본만 해당한다.
-- 표본마다 구역을 찾으므로 행이 많으면 느리다. 운영 DB가 아닌 백업본에서 실행한다.
SET time_zone = '+00:00';

WITH layouts (map_version, layout) AS (
    VALUES
        ROW('544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0', 'legacy'),
        ROW('ae833248d2dd356c6603af72b2b865f9051a866e9cfa7d2b9c9abe890579944d', 'legacy'),
        ROW('cac3cb040a43630b0b40201ab089a4b328146c03211867b2a155d2b3614acc81', 'generated'),
        ROW('04350122fdeee2b89212345ee4f776990d78832bb25435418b5ea6f2b2fbc769', 'generated'),
        ROW('c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07', 'generated'),
        ROW('b1a69e7d26d34bbb56cc88e110d7b4495b5d833669dfd708cf3c416d71a42404', 'renewal')
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

        ROW('generated', 'mailbox', 'ELLIPSE', 24.2, 30.4, 3.0, 3.0, NULL, 1),
        ROW('generated', 'fish-bread-cart', 'ELLIPSE', -30.1, 35.8, 6.5, 6.5, NULL, 2),
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
        ROW('generated', 'drink-kiosk', 'ELLIPSE', 30.06, 54.13, 5.0, 5.0, NULL, 7),
        ROW('generated', 'ranking-board', 'ELLIPSE', 30.0, 35.6, 5.0, 5.0, NULL, 7),
        ROW('generated', 'fountain-plaza', 'ELLIPSE', -63.0, -56.0, 14.0, 14.0, NULL, 8),
        ROW('generated', 'vr-zone', 'RECT', -63.0, -12.0, 20.0, 17.0, NULL, 8),
        ROW('generated', 'event-plaza', 'RECT', -64.0, 21.0, 16.0, 13.0, NULL, 8),
        ROW('generated', 'fitness', 'RECT', -63.0, 64.0, 16.0, 12.0, NULL, 8),
        ROW('generated', 'south-plaza', 'ELLIPSE', 0.0, 46.0, 24.0, 24.0, NULL, 8),
        ROW('generated', 'lake', 'ELLIPSE', 62.0, -14.0, 21.0, 46.0, NULL, 9),

        ROW('renewal', 'mailbox', 'ELLIPSE', -21.97, 24.01, 3.0, 3.0, NULL, 1),
        ROW('renewal', 'stele', 'ELLIPSE', -58.0, 26.0, 3.0, 3.0, NULL, 1),
        ROW('renewal', 'gacha', 'ELLIPSE', 22.0, 29.0, 4.0, 4.0, NULL, 2),
        ROW('renewal', 'lottery', 'ELLIPSE', 23.0, 35.0, 6.0, 6.0, NULL, 2),
        ROW('renewal', 'ranking-board', 'ELLIPSE', -24.0, 26.0, 6.0, 6.0, NULL, 2),
        ROW('renewal', 'cafe', 'ELLIPSE', 16.0, -18.0, 9.0, 9.0, NULL, 3),
        ROW('renewal', 'dock', 'ELLIPSE', 59.0, 18.5, 8.0, 8.0, NULL, 3),
        ROW('renewal', 'fish-bread-shop', 'ELLIPSE', -19.0, -22.0, 9.0, 9.0, NULL, 3),
        ROW('renewal', 'fishing', 'ELLIPSE', 83.0, -43.0, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'island-pavilion', 'ELLIPSE', 62.0, -18.0, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'jump-start', 'ELLIPSE', -66.0, 13.0, 10.0, 10.0, NULL, 3),
        ROW('renewal', 'mobility-entry', 'ELLIPSE', -10.0, 86.5, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mobility-fitness', 'ELLIPSE', -52.59, 85.87, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mobility-hill', 'ELLIPSE', -13.3, -59.0, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mobility-lake', 'ELLIPSE', 95.5, 38.5, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mobility-north', 'ELLIPSE', 79.8, -64.66, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mobility-plaza', 'ELLIPSE', 60.0, 38.0, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mobility-rest', 'ELLIPSE', -27.5, 49.5, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mobility-west', 'ELLIPSE', -76.0, 40.0, 7.0, 7.0, NULL, 3),
        ROW('renewal', 'mole', 'ELLIPSE', -36.0, 31.0, 10.0, 10.0, NULL, 3),
        ROW('renewal', 'pigeon', 'ELLIPSE', -38.0, 4.0, 9.0, 9.0, NULL, 3),
        ROW('renewal', 'rest-1', 'ELLIPSE', -71.0, 66.0, 8.0, 8.0, NULL, 3),
        ROW('renewal', 'rest-2', 'ELLIPSE', -89.0, -43.0, 8.0, 8.0, NULL, 3),
        ROW('renewal', 'rest-3', 'ELLIPSE', 64.0, -71.0, 8.0, 8.0, NULL, 3),
        ROW('renewal', 'rest-4', 'ELLIPSE', 73.0, 48.0, 8.0, 8.0, NULL, 3),
        ROW('renewal', 'shooting', 'ELLIPSE', -34.0, -22.0, 9.0, 9.0, NULL, 3),
        ROW('renewal', 'arcade', 'ELLIPSE', -65.0, 47.0, 11.0, 11.0, NULL, 4),
        ROW('renewal', 'folk', 'ELLIPSE', -61.0, 78.0, 10.0, 10.0, NULL, 4),
        ROW('renewal', 'fortune', 'ELLIPSE', 9.0, 90.0, 6.0, 6.0, NULL, 4),
        ROW('renewal', 'tower', 'ELLIPSE', 96.0, 24.0, 13.0, 13.0, NULL, 4),
        ROW('renewal', 'vr-zone', 'ELLIPSE', -57.0, -19.0, 12.0, 12.0, NULL, 4),
        ROW('renewal', 'balloon', 'ELLIPSE', -40.0, -76.0, 21.0, 21.0, NULL, 5),
        ROW('renewal', 'central-pavilion', 'ELLIPSE', 0.0, 4.0, 16.0, 16.0, NULL, 5),
        ROW('renewal', 'fitness', 'ELLIPSE', -24.0, 72.0, 23.0, 23.0, NULL, 5),
        ROW('renewal', 'fountain-plaza', 'ELLIPSE', 47.0, 58.0, 18.0, 18.0, NULL, 5),
        ROW('renewal', 'pagoda', 'ELLIPSE', 0.0, -80.0, 19.0, 19.0, NULL, 5),
        ROW('renewal', 'plaza', 'ELLIPSE', 0.0, 38.0, 20.0, 20.0, NULL, 5),
        ROW('renewal', 'reserve-north', 'ELLIPSE', 39.0, -86.0, 12.0, 12.0, NULL, 5),
        ROW('renewal', 'reserve-west', 'ELLIPSE', -93.0, -4.0, 11.0, 11.0, NULL, 5),
        ROW('renewal', 'lake', 'ELLIPSE', 62.0, -18.0, 29.0, 36.0, NULL, 6)
),
assigned AS (
    SELECT COALESCE(l.layout, 'unmapped') AS layout,
           p.user_id,
           p.moving,
           CASE WHEN l.layout IS NULL THEN 'unmapped'
                WHEN l.layout = 'renewal' AND EXISTS (
                    SELECT 1
                    FROM jump_runs r
                    WHERE r.user_id = p.user_id
                      AND p.sampled_at >= r.started_at
                      AND p.sampled_at <= COALESCE(r.ended_at, r.started_at + INTERVAL 30 MINUTE)
                ) THEN 'jump-course'
                ELSE COALESCE((
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
