-- 한국 날짜·원장 유형별 엽전 흐름. 금액의 원본은 지갑 원장(wallet_transactions)이다.
-- coins_in·coins_out은 잔액(balance_delta)의 들어온 양과 나간 양이다. 예약(GAME_RESERVE·GAME_RELEASE)은
-- 잔액을 바꾸지 않으므로 금액이 0이고 거래 수만 보인다.
-- 날짜마다 마지막 ALL 행의 net_coins가 그날 새로 풀린 엽전(발행 − 소각)이다. 경기 정산은 참가자끼리
-- 주고받으므로 경기별 합계가 0이고, 공동 승리 보너스(GAME_TIE_BONUS)만 새로 발행된다.
-- 유형을 고정하지 않으므로 새 원장 유형(관리자 지급·점프맵 보상 등)이 생기면 자동으로 행이 추가된다.
SET time_zone = '+00:00';

WITH tx AS (
    SELECT DATE(t.created_at + INTERVAL 9 HOUR) AS kst_date,
           t.transaction_type,
           w.user_id,
           t.balance_delta
    FROM wallet_transactions t
    JOIN wallets w ON w.id = t.wallet_id
)
SELECT kst_date,
       transaction_type,
       transactions,
       users,
       coins_in,
       coins_out,
       net_coins
FROM (
    SELECT kst_date,
           transaction_type,
           0 AS is_total,
           COUNT(*) AS transactions,
           COUNT(DISTINCT user_id) AS users,
           SUM(GREATEST(balance_delta, 0)) AS coins_in,
           SUM(GREATEST(-balance_delta, 0)) AS coins_out,
           SUM(balance_delta) AS net_coins
    FROM tx
    GROUP BY kst_date, transaction_type
    UNION ALL
    SELECT kst_date,
           'ALL',
           1,
           COUNT(*),
           COUNT(DISTINCT user_id),
           SUM(GREATEST(balance_delta, 0)),
           SUM(GREATEST(-balance_delta, 0)),
           SUM(balance_delta)
    FROM tx
    GROUP BY kst_date
) daily
ORDER BY kst_date, is_total, transaction_type;
