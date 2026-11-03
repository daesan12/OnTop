-- 한국 날짜(play_date)별 가위바위보 룰렛 판 수, 참가자, 끝난 판, 진행 중, 참가비(10·20·30)별 판 수,
-- 참가비 합계, 지급 판, 지급 합계, 참가비 대비 지급 비율, 엽전 흡수량. 기능 테이블(rps_roulette_rounds, V136)을 읽는다.
-- 참가비는 판을 시작할 때 원장 MINIGAME_ENTRY_FEE로 빠지고, 지급은 RPS_ROULETTE_PAYOUT으로 들어온다.
-- absorbed_coins(참가비 − 지급)가 양수면 룰렛이 시장의 엽전을 거둬들인 것이다. 표본이 적은 날은 운에 크게 흔들린다.
-- 진행 중(DUEL·DECIDE)인 판의 참가비도 합계에 들어가고, 지급은 아직 0이다.
SET time_zone = '+00:00';

SELECT play_date AS kst_date,
       COUNT(*) AS rounds,
       COUNT(DISTINCT user_id) AS players,
       SUM(phase = 'SETTLED') AS settled,
       SUM(phase <> 'SETTLED') AS in_progress,
       SUM(fee = 10) AS fee_10_rounds,
       SUM(fee = 20) AS fee_20_rounds,
       SUM(fee = 30) AS fee_30_rounds,
       SUM(fee) AS fees,
       SUM(outcome <=> 'PAID') AS paid_rounds,
       SUM(payout) AS payouts,
       ROUND(100 * SUM(payout) / NULLIF(SUM(fee), 0), 1) AS payout_pct,
       SUM(fee) - SUM(payout) AS absorbed_coins
FROM rps_roulette_rounds
GROUP BY play_date
ORDER BY play_date;
