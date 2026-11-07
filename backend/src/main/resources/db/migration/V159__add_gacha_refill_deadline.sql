-- 공유 기계의 보충 대기는 노드/브라우저 재시작으로 초기화하지 않는다.
-- 기존 기계 행은 NULL(보충 대기 없음)로 보존한다.
ALTER TABLE gacha_machine ADD COLUMN refill_ends_at TIMESTAMP(3) NULL DEFAULT NULL;
