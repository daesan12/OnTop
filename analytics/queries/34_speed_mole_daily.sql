-- 한국 날짜(판 시작 기준)·규칙 버전별 스피드 두더지 판 수, 참가자, 정산된 판·미정산 판, 평균·최고 점수,
-- 평균 적중·실수, 적중률, 계산된 보상, 실제 지급, 한도에 깎인 엽전. 기능 테이블(speed_mole_rounds, db/minigame V151)을 읽는다.
-- 60초 동안 구멍 8개 중 4개에 나온 두더지를 친다. 적중 1점, 빈 구멍은 실수로 3점을 깎는다(0 아래로는 내려가지 않음).
-- 기존 두더지(28번, mole_rounds)와 다른 게임이라 점수를 서로 비교하지 않는다.
-- 보상은 5점당 1냥(SpeedMoleRules.POINTS_PER_COIN)이고 13번 공동 일일 한도 안에서 지급된다.
-- 판 테이블에는 지급액이 없어 원장에서 찾는다. 원장 유형은 기존 두더지와 같은 MOLE_REWARD이고
-- 키가 'mole:reward:speed:<판 번호>'이다. 한도에 막혀 0냥이면 원장 행이 없다.
-- 서버는 시간이 지난 판을 따로 표시하지 않는다. 미정산(ACTIVE) 판에는 아직 진행 중인 판과 제출하지 않고 끝난 판이 섞여 있다.
SET time_zone = '+00:00';

WITH rewards AS (
    SELECT CAST(SUBSTRING(idempotency_key, CHAR_LENGTH('mole:reward:speed:') + 1) AS UNSIGNED) AS round_id,
           SUM(balance_delta) AS coins
    FROM wallet_transactions
    WHERE transaction_type = 'MOLE_REWARD'
      AND idempotency_key LIKE 'mole:reward:speed:%'
    GROUP BY round_id
)
SELECT DATE(r.started_at + INTERVAL 9 HOUR) AS kst_date,
       r.rules_version,
       COUNT(*) AS rounds,
       COUNT(DISTINCT r.user_id) AS players,
       SUM(r.status = 'SETTLED') AS settled,
       SUM(r.status = 'ACTIVE') AS unsettled,
       ROUND(AVG(r.score), 1) AS avg_score,
       MAX(r.score) AS max_score,
       ROUND(AVG(r.hits), 1) AS avg_hits,
       ROUND(AVG(r.misses), 1) AS avg_misses,
       ROUND(100 * SUM(r.hits) / NULLIF(SUM(r.hits) + SUM(r.misses), 0), 1) AS hit_pct,
       COALESCE(SUM(r.score DIV 5), 0) AS calculated_coins,
       COALESCE(SUM(w.coins), 0) AS rewarded_coins,
       COALESCE(SUM(r.score DIV 5), 0) - COALESCE(SUM(w.coins), 0) AS capped_coins
FROM speed_mole_rounds r
LEFT JOIN rewards w ON w.round_id = r.id
GROUP BY kst_date, r.rules_version
ORDER BY kst_date, r.rules_version;
