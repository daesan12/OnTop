-- 한국 날짜(판 시작 기준)별 두더지 판 수, 참가자, 끝난 판·만료·진행 중, 평균·최고 점수, 평균 콤보·잡은 수,
-- 계산된 보상, 실제 지급, 한도에 깎인 엽전. 기능 테이블(mole_rounds, V147)을 읽는다.
-- 두더지는 참가비가 없고, 보상(점수 30점당 1냥)은 원장 MOLE_REWARD로 들어와 13번 공동 일일 한도에 포함된다.
-- capped_coins(계산 − 지급)가 크면 한도에 걸려 보상을 못 받은 판이 많다는 뜻이다.
-- 점수·콤보 평균은 정산된(SETTLED) 판만 계산한다. EXPIRED는 제출 없이 시간이 지난 판이다.
SET time_zone = '+00:00';

SELECT DATE(started_at + INTERVAL 9 HOUR) AS kst_date,
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
FROM mole_rounds
GROUP BY kst_date
ORDER BY kst_date;
