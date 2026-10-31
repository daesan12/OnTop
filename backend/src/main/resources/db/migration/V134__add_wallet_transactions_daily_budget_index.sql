-- 지갑을 잠근 뒤 수행하는 KST 일일 미니게임 보상 집계가 해당 날짜 범위만 읽도록 한다.
CREATE INDEX ix_wallet_transactions_wallet_created
    ON wallet_transactions (wallet_id, created_at);
