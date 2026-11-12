-- 한국 날짜(판 시작 기준)·규칙 버전별 두더지 판 수, 참가자, 끝난 판·만료·진행 중, 평균·최고 점수,
-- 평균 콤보·잡은 수, 계산된 보상, 실제 지급, 한도에 깎인 엽전. 기능 테이블(mole_rounds, V147·V149·V150)을 읽는다.
-- 규칙마다 두더지 수·망치·보상 비율이 달라 점수를 서로 비교할 수 없으므로 rules_version별로 나눈다.
-- points_per_coin: 규칙 1은 30점, 규칙 2(S15P31B105-340)는 45점, 규칙 3(S15P31B105-342)은 40점당 1냥.
-- 두더지는 참가비가 없고, 보상은 원장 MOLE_REWARD로 들어와 13번 공동 일일 한도에 포함된다.
-- capped_coins(계산 − 지급)가 크면 한도에 걸려 보상을 못 받은 판이 많다는 뜻이다.
-- 점수·콤보 평균은 정산된(SETTLED) 판만 계산한다. EXPIRED는 제출 없이 시간이 지난 판이다.
SET time_zone = '+00:00';

SELECT DATE(started_at + INTERVAL 9 HOUR) AS kst_date,
       rules_version,
       CASE rules_version WHEN 1 THEN 30 WHEN 2 THEN 45 ELSE 40 END AS points_per_coin,
       COUNT(*) AS rounds,
       COUNT(DISTINCT user_id) AS players,
       SUM(status = 'SETTLED') AS settled,
       SUM(status = 'EXPIRED') AS expired,
       SUM(status = 'ACTIVE') AS active,
       ROUND(AVG(score), 1) AS avg_score,
       MAX(score) AS max_score,
       ROUND(AVG(max_combo), 1) AS avg_max_combo,
       ROUND(AVG(caught), 1) AS avg_caught,
       COALESCE(SUM(calculated_reward), 0) AS calculated_coins,
       COALESCE(SUM(reward), 0) AS rewarded_coins,
       COALESCE(SUM(calculated_reward - reward), 0) AS capped_coins
FROM mole_rounds r
WHERE NOT EXISTS (
    SELECT 1
    FROM JSON_TABLE(COALESCE(@mole_confirmed_user_ids, '[]'), '$[*]' COLUMNS (user_id BIGINT PATH '$')) AS confirmed
    WHERE confirmed.user_id = r.user_id
)
GROUP BY kst_date, rules_version
ORDER BY kst_date, rules_version;
