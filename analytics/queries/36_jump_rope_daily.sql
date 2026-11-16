-- 한국 날짜(판 시작 기준)·규칙 버전별 구구구 줄넘기 판 수, 참가자, 정산된 판·미정산 판, 종료 사유,
-- 평균·최고 점수, 평균 퍼펙트·굿·실수, 계산된 보상, 실제 지급, 한도에 깎인 엽전.
-- 기능 테이블(jump_rope_rounds, db/minigame V175)을 읽는다. 60초 동안 줄을 넘고, 세 번 실수하면 끝난다.
-- 보상은 시간이 다 돼 끝난 판(end_reason = 'time')만 50점당 1냥(JumpRopeRewards)이고, 세 번 실수로 끝난 판
-- (missLimit)은 0냥이다. 13번 공동 일일 한도 안에서 지급된다.
-- 판 테이블에는 지급액이 없어 원장에서 찾는다. 원장 유형은 붕어빵과 같은 MINIGAME_REWARD이고 키가
-- 'jump-rope:reward:<판 번호>'다. 한도에 막혀 0냥이면 원장 행이 없다.
-- 미정산(ACTIVE) 판에는 진행 중인 판과 제출하지 않고 만료된 판(시작 후 95초)이 섞여 있다.
-- 줄넘기 매크로 의심은 팀 감사 기록(jump_rope_audits, V178)과 관리자 화면에서 본다.
SET time_zone = '+00:00';

WITH rewards AS (
    SELECT CAST(SUBSTRING(idempotency_key, CHAR_LENGTH('jump-rope:reward:') + 1) AS UNSIGNED) AS round_id,
           SUM(balance_delta) AS coins
    FROM wallet_transactions
    WHERE transaction_type = 'MINIGAME_REWARD'
      AND idempotency_key LIKE 'jump-rope:reward:%'
    GROUP BY round_id
)
SELECT DATE(r.started_at + INTERVAL 9 HOUR) AS kst_date,
       r.rules_version,
       COUNT(*) AS rounds,
       COUNT(DISTINCT r.user_id) AS players,
       SUM(r.status = 'SETTLED') AS settled,
       SUM(r.status = 'ACTIVE') AS unsettled,
       SUM(r.end_reason = 'time') AS time_ends,
       SUM(r.end_reason = 'missLimit') AS miss_limit_ends,
       ROUND(AVG(r.score), 1) AS avg_score,
       MAX(r.score) AS max_score,
       ROUND(AVG(r.perfect_count), 1) AS avg_perfect,
       ROUND(AVG(r.good_count), 1) AS avg_good,
       ROUND(AVG(r.miss_count), 1) AS avg_miss,
       COALESCE(SUM(CASE WHEN r.end_reason = 'time' THEN r.score DIV 50 ELSE 0 END), 0) AS calculated_coins,
       COALESCE(SUM(w.coins), 0) AS rewarded_coins,
       COALESCE(SUM(CASE WHEN r.end_reason = 'time' THEN r.score DIV 50 ELSE 0 END), 0)
           - COALESCE(SUM(w.coins), 0) AS capped_coins
FROM jump_rope_rounds r
LEFT JOIN rewards w ON w.round_id = r.id
GROUP BY kst_date, r.rules_version
ORDER BY kst_date, r.rules_version;
