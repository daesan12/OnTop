-- 한국 날짜(play_date)별 플러스마이너스 판 수, 참가자, 결과별 판(꽝·지급·잭팟), 참가비 합계, 지급 합계,
-- 참가비 대비 지급 비율, 엽전 흡수량. 기능 테이블(plus_minus_rounds, V143)을 읽는다.
-- 참가비(30냥 고정)는 원장 MINIGAME_ENTRY_FEE, 지급은 PLUS_MINUS_PAYOUT이다. 잭팟은 500냥 고정이다.
-- absorbed_coins(참가비 − 지급)가 양수면 엽전을 거둬들이는 소비처로 동작한 것이다. 잭팟 한 번에 크게 흔들리므로
-- 여러 날을 합쳐 본다.
SET time_zone = '+00:00';

SELECT play_date AS kst_date,
       COUNT(*) AS rounds,
       COUNT(DISTINCT user_id) AS players,
       SUM(outcome = 'LOST') AS lost,
       SUM(outcome = 'PAID') AS paid,
       SUM(outcome = 'JACKPOT') AS jackpot,
       SUM(fee) AS fees,
       SUM(payout) AS payouts,
       ROUND(100 * SUM(payout) / NULLIF(SUM(fee), 0), 1) AS payout_pct,
       SUM(fee) - SUM(payout) AS absorbed_coins
FROM plus_minus_rounds
GROUP BY play_date
ORDER BY play_date;
