-- 한국 날짜(play_date)별 가위바위보 룰렛 판 수, 참가자, 끝난 판, 진행 중, 참가비(10·20·30)별 판 수,
-- 참가비 합계, 지급 판, 지급 합계, 참가비 대비 지급 비율, 엽전 흡수량, 끝난 판의 도전 단계별 결과.
-- 기능 테이블(rps_roulette_rounds, V136)을 읽는다.
-- 참가비는 판을 시작할 때 원장 MINIGAME_ENTRY_FEE로 빠지고, 지급은 RPS_ROULETTE_PAYOUT으로 들어온다.
-- absorbed_coins(참가비 − 지급)가 양수면 룰렛이 시장의 엽전을 거둬들인 것이다. 표본이 적은 날은 운에 크게 흔들린다.
-- 진행 중(DUEL·DECIDE)인 판의 참가비도 합계에 들어가고, 지급은 아직 0이다.
-- 판 흐름: 첫 대결에서 지면 끝(first_duel_lost). 이기면 바로 룰렛을 돌리거나(paid_x1) 도전한다.
-- 도전에서 이기면 배수가 한 단계 오르고(stake_level), 지면 꽝이다(challenge_lost). 도전은 두 번까지다. 비기면 다시 겨룬다.
-- 배수는 V164(db/minigame)에서 ×1.0/×1.5/×2.0 → ×1.0/×2.0/×4.0으로 올랐고 룰렛판 칸도 바뀌었다(평균 61/30 → 68/30).
-- 판 기록에는 규칙 버전이 없으므로 운영에 V164가 적용된 시각(flyway_schema_history.installed_on) 전후로 나눠 본다.
-- 기대 지급률(이길 확률 1/2): 이전 규칙은 바로 받기 102%, 한 번 도전 76%, 두 번 도전 51%.
-- V164 이후에는 어느 쪽을 골라도 113%라서 평균적으로 참가비보다 지급이 많다.
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
       SUM(fee) - SUM(payout) AS absorbed_coins,
       SUM(outcome <=> 'LOST' AND NOT challenging) AS first_duel_lost,
       SUM(outcome <=> 'LOST' AND challenging) AS challenge_lost,
       SUM(outcome <=> 'PAID' AND stake_level = 0) AS paid_x1,
       SUM(outcome <=> 'PAID' AND stake_level = 1) AS paid_after_1_challenge,
       SUM(outcome <=> 'PAID' AND stake_level = 2) AS paid_after_2_challenges
FROM rps_roulette_rounds
GROUP BY play_date
ORDER BY play_date;
