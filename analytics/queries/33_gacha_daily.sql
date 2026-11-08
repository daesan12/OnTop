-- 한국 날짜별 의상 뽑기: 뽑기권 구매, 캡슐 뽑기, 등급별 결과, 상자 열기, 중복 환급, 쓴 엽전·돌려준 엽전.
-- 기능 테이블(gacha_receipts, V157)의 확정 영수증을 읽는다. 영수증 한 행이 요청 하나(BUY·DRAW·OPEN)이고
-- 같은 작업 ID 재시도는 영수증을 새로 만들지 않으므로 중복으로 세지 않는다.
-- result_json에서 grade·duplicate·paidCoins·awardedCoins·roundId만 꺼낸다(GachaDtos.Result). 보유 잔액은 읽지 않는다.
-- BUY: 뽑기권 1장 100냥(GachaRules.TICKET_PRICE). DRAW: 공유 기계에서 캡슐 1개. grade 1~4는 등급 상자,
-- 5는 엽전 캡슐(20냥). 한 회차는 1·2·4·8등 상자 1·2·4·8개와 엽전 캡슐 15개, 모두 30개이고 다 뽑히면 다음 회차다.
-- OPEN: 상자를 열어 의상을 받는다. 이미 가진 의상이면 상자 값의 절반(500·250·125·50냥)을 돌려준다(duplicate).
-- 뽑기권은 알림함 보상(notification_rewards, GACHA_TICKET)으로도 받으므로 draws가 tickets_bought보다 클 수 있다.
-- absorbed_coins = 쓴 엽전 − 돌려준 엽전. 양수면 뽑기가 엽전을 거둬들이는 것이다(19번의 GACHA_* 원장 합계와 같아야 한다).
-- 엽전 캡슐만 따지면 한 회차에 300냥(15×20)을 돌려주므로 중복 환급이 없을 때 회수율은 약 10%다.
SET time_zone = '+00:00';

WITH receipts AS (
    SELECT DATE(created_at + INTERVAL 9 HOUR) AS kst_date,
           user_id,
           operation_kind AS kind,
           CAST(result_json->>'$.grade' AS SIGNED) AS grade,
           result_json->>'$.duplicate' = 'true' AS duplicate,
           CAST(result_json->>'$.paidCoins' AS SIGNED) AS paid,
           CAST(result_json->>'$.awardedCoins' AS SIGNED) AS awarded,
           result_json->>'$.roundId' AS round_id
    FROM gacha_receipts
)
SELECT kst_date,
       SUM(kind = 'BUY') AS tickets_bought,
       COUNT(DISTINCT CASE WHEN kind = 'BUY' THEN user_id END) AS buyers,
       SUM(kind = 'DRAW') AS draws,
       COUNT(DISTINCT CASE WHEN kind = 'DRAW' THEN user_id END) AS drawers,
       COUNT(DISTINCT CASE WHEN kind = 'DRAW' THEN round_id END) AS rounds_drawn,
       SUM(kind = 'DRAW' AND grade = 1) AS grade1_boxes,
       SUM(kind = 'DRAW' AND grade = 2) AS grade2_boxes,
       SUM(kind = 'DRAW' AND grade = 3) AS grade3_boxes,
       SUM(kind = 'DRAW' AND grade = 4) AS grade4_boxes,
       SUM(kind = 'DRAW' AND grade = 5) AS coin_capsules,
       SUM(kind = 'OPEN') AS opens,
       SUM(kind = 'OPEN' AND duplicate) AS duplicates,
       SUM(paid) AS coins_spent,
       SUM(awarded) AS coins_returned,
       SUM(paid) - SUM(awarded) AS absorbed_coins,
       ROUND(100 * SUM(awarded) / NULLIF(SUM(paid), 0), 1) AS return_pct
FROM receipts
GROUP BY kst_date
ORDER BY kst_date;
