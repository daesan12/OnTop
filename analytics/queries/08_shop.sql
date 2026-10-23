-- 아이템별 구매 수, 구매자 수, 구매 수량, 장착 수. 금액의 원본은 wallet_transactions·shop_purchases다.
-- 아이템 이름이 필요하면 상점 테이블(items)이 있는 DB에서 item_id로 연결한다.
SET time_zone = '+00:00';

SELECT CAST(props->>'$.itemId' AS UNSIGNED) AS item_id,
       SUM(event_type = 'SHOP_PURCHASED') AS purchases,
       COUNT(DISTINCT CASE WHEN event_type = 'SHOP_PURCHASED' THEN user_id END) AS buyers,
       COALESCE(SUM(CASE WHEN event_type = 'SHOP_PURCHASED' THEN CAST(props->>'$.quantity' AS UNSIGNED) END), 0)
           AS quantity,
       SUM(event_type = 'ITEM_EQUIPPED') AS equips
FROM behavior_events
WHERE event_type IN ('SHOP_PURCHASED', 'ITEM_EQUIPPED')
GROUP BY item_id
ORDER BY purchases DESC, item_id;
