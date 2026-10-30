-- 백업 시점 활성 회원(탈퇴 제외) 지갑의 잔액 분포. 회원별 잔액은 내보내지 않고 요약값만 낸다.
-- 랭킹 API와 같이 잔액(balance)은 예약 중 금액(reserved_balance)을 포함한다.
-- top10_share_pct는 잔액 상위 10%(올림) 지갑이 전체 잔액에서 차지하는 비율이다. 높을수록 소수에게 쏠려 있다.
-- 평균과 중앙값 차이가 크면 소수의 큰 잔액이 평균을 끌어올린 것이다.
WITH ranked AS (
    SELECT w.balance,
           w.reserved_balance,
           ROW_NUMBER() OVER (ORDER BY w.balance) AS asc_rank,
           ROW_NUMBER() OVER (ORDER BY w.balance DESC) AS desc_rank,
           COUNT(*) OVER () AS wallets
    FROM wallets w
    JOIN users u ON u.id = w.user_id
    WHERE u.deleted_at IS NULL
)
SELECT COUNT(*) AS wallets,
       SUM(balance) AS total_balance,
       ROUND(AVG(balance), 1) AS avg_balance,
       ROUND(AVG(CASE WHEN asc_rank IN (FLOOR((wallets + 1) / 2), CEIL((wallets + 1) / 2)) THEN balance END), 1)
           AS median_balance,
       MAX(balance) AS max_balance,
       ROUND(100 * SUM(CASE WHEN desc_rank <= CEIL(wallets * 0.1) THEN balance ELSE 0 END)
           / NULLIF(SUM(balance), 0), 1) AS top10_share_pct,
       SUM(reserved_balance) AS reserved_balance
FROM ranked;
