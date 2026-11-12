-- 응모권 주간 한도를 10장에서 50장으로 늘린다. 판매 중·예정 회차는 즉시 적용하고 마감 회차 기록은 그대로 둔다.
ALTER TABLE raffle_rounds ALTER COLUMN weekly_ticket_limit SET DEFAULT 50;

UPDATE raffle_rounds SET weekly_ticket_limit = 50 WHERE sales_status <> 'CLOSED';
