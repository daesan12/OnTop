-- 공방 목록에서만 삭제한다. 기존 보유품·세트 구성·공개 파일·영수증은 유지한다.
ALTER TABLE skin_catalog
    ADD COLUMN deleted_at TIMESTAMP(3) NULL,
    ADD COLUMN deleted_by BIGINT NULL,
    ADD CONSTRAINT fk_skin_deleter FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE skin_sets
    ADD COLUMN deleted_at TIMESTAMP(3) NULL,
    ADD COLUMN deleted_by BIGINT NULL,
    ADD CONSTRAINT fk_skin_set_deleter FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
