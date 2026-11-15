-- 회원별 붕어빵 '치익' 신호 뒤 뒤집기 반응 시간(S15P31B105-442). 2026-11-12 매크로 자백으로 확인한 판별 기준이다.
-- 화면은 익힘이 70(황금 시작)에 닿는 순간 '치익'을 띄운다. 판마다 저장된 행동 기록(bungeoppang_records.submission)과
-- 굽기 속도(heats)·판 설정(config_json)으로 서버와 같은 식으로 그 시각을 다시 구해, 뒤집은 시각과의 차이(rt)를 잰다.
-- 판 시작 90초 전(굽기 속도가 바뀌기 전) 뒤집기만 쓴다. v5 완료 판만 본다.
--   사람: 신호 뒤 150ms 안에 뒤집는 비율이 0~8%, 그런 뒤집기가 판의 절반을 넘는 판(rounds_mostly_under150_pct)은 0%.
--         미리 짐작하는 사람은 신호보다 먼저 뒤집는 비율(early_pct)도 함께 높다.
--   신호 직후 반응하는 프로그램: 150ms 안 비율이 90% 이상인 판이 이어지고, 신호보다 먼저 누른 적이 거의 없다.
-- 익힘 값을 읽고 정해진 값(예: 74)에서 누르는 다른 방식은 반응 시간이 0.3초 안팎에 몰려 r150_500_pct가 아주 높다.
-- 판마다 행동 기록을 펼쳐서 무겁다. 운영 DB가 아닌 백업에서, 필요하면 started_at 조건을 넣어 기간을 줄인다.
-- 결과에는 회원 번호만 있다. 공유할 때도 닉네임을 붙이지 않는다.
SET time_zone = '+00:00';

WITH rounds AS (
    SELECT s.id AS sid, s.user_id, b.heats, b.submission,
           CAST(JSON_EXTRACT(r.config_json, '$.rules.sideMs') AS SIGNED) AS side_ms,
           CAST(JSON_EXTRACT(r.config_json, '$.rules.rushFromMs') AS SIGNED) AS rush_from_ms
    FROM minigame_sessions s
    JOIN bungeoppang_records b ON b.minigame_session_id = s.id AND b.rules_version = 'v5'
    JOIN bungeoppang_v4_rounds r ON r.minigame_session_id = s.id
    WHERE s.minigame_type = 'BUNGEOPPANG' AND s.status = 'COMPLETED' AND b.submission IS NOT NULL
),
-- rounds를 바깥 질의에 합치면 MySQL이 JSON_TABLE을 조인보다 먼저 풀려다 'Incorrect arguments to JSON_TABLE'로
-- 실패할 수 있어 NO_MERGE로 먼저 만든다.
acts AS (
    SELECT /*+ NO_MERGE(ro) */ ro.sid, j.seq, j.action, j.t, j.slot
    FROM rounds ro,
         JSON_TABLE(ro.submission, '$.log[*]' COLUMNS (
             seq INT PATH '$.seq', action VARCHAR(16) PATH '$.action', t INT PATH '$.t',
             slot INT PATH '$.slot' NULL ON EMPTY)) j
),
stepped AS (
    SELECT sid, seq, action, t, slot,
           LAG(action) OVER (PARTITION BY sid, slot ORDER BY seq) AS prev_slot_action,
           LAG(t) OVER (PARTITION BY sid, slot ORDER BY seq) AS prev_slot_t,
           SUM(action = 'FILL') OVER (PARTITION BY sid ORDER BY seq ROWS UNBOUNDED PRECEDING) - 1 AS fill_no
    FROM acts
),
slotted AS (
    SELECT st.*, MAX(CASE WHEN action = 'FILL' THEN fill_no END)
               OVER (PARTITION BY sid, slot ORDER BY seq ROWS UNBOUNDED PRECEDING) AS heat_no
    FROM stepped st
),
rts AS (
    SELECT x.sid, ro.user_id,
           (x.t - x.prev_slot_t)
               - CEIL(70 * ro.side_ms / CAST(JSON_EXTRACT(ro.heats, CONCAT('$[', x.heat_no, ']')) AS SIGNED)) AS rt
    FROM slotted x JOIN rounds ro ON ro.sid = x.sid
    WHERE x.action = 'TURN' AND x.prev_slot_action IN ('FILL', 'TURN') AND x.t < ro.rush_from_ms
),
per_round AS (
    SELECT sid, user_id, AVG(rt BETWEEN 0 AND 149) AS under150
    FROM rts GROUP BY sid, user_id
),
round_share AS (
    SELECT user_id,
           ROUND(100 * AVG(under150 > 0.5), 1) AS rounds_mostly_under150_pct,
           ROUND(100 * MAX(under150), 1) AS max_round_under150_pct
    FROM per_round GROUP BY user_id
)
SELECT r.user_id,
       COUNT(DISTINCT r.sid) AS rounds,
       COUNT(*) AS turns,
       ROUND(100 * AVG(r.rt < 0), 1) AS early_pct,
       ROUND(100 * AVG(r.rt BETWEEN 0 AND 99), 1) AS under100_pct,
       ROUND(100 * AVG(r.rt BETWEEN 0 AND 149), 1) AS under150_pct,
       ROUND(100 * AVG(r.rt BETWEEN 150 AND 499), 1) AS r150_500_pct,
       ROUND(100 * AVG(r.rt >= 500), 1) AS over500_pct,
       s.rounds_mostly_under150_pct,
       s.max_round_under150_pct
FROM rts r
JOIN round_share s ON s.user_id = r.user_id
GROUP BY r.user_id, s.rounds_mostly_under150_pct, s.max_round_under150_pct
ORDER BY under150_pct DESC, r.user_id;
