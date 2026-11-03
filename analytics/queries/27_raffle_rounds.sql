-- 주간 추첨 회차별 판매 상태, 티켓 가격, 판매 티켓 수, 구매자, 1인 평균·최대 구매, 사용된 엽전.
-- 기능 테이블(raffle_rounds·raffle_tickets, V140)을 읽는다. 구매 금액의 원본은 원장 RAFFLE_PURCHASE다.
-- 1인 최대가 주간 한도(weekly_ticket_limit)에 자주 닿으면 한도가 낮거나 소수에게 쏠린 것이다.
-- 티켓이 하나도 팔리지 않은 회차도 0으로 보인다. 당첨 결과는 이 테이블에 없어 다루지 않는다.
SET time_zone = '+00:00';

WITH per_buyer AS (
    SELECT round_id, user_id, COUNT(*) AS tickets, SUM(purchase_price) AS spent
    FROM raffle_tickets
    GROUP BY round_id, user_id
)
SELECT r.week_start_date,
       r.sales_status,
       r.ticket_price,
       r.weekly_ticket_limit,
       COALESCE(SUM(b.tickets), 0) AS tickets,
       COUNT(b.user_id) AS buyers,
       ROUND(AVG(b.tickets), 1) AS avg_tickets_per_buyer,
       MAX(b.tickets) AS max_tickets_per_buyer,
       COALESCE(SUM(b.tickets >= r.weekly_ticket_limit), 0) AS buyers_at_limit,
       COALESCE(SUM(b.spent), 0) AS coins_spent
FROM raffle_rounds r
LEFT JOIN per_buyer b ON b.round_id = r.id
GROUP BY r.id, r.week_start_date, r.sales_status, r.ticket_price, r.weekly_ticket_limit
ORDER BY r.week_start_date;
