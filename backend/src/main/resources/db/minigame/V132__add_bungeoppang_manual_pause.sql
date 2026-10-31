-- 설명서를 읽는 동안의 정지를 저장한다. 원래 플레이 길이는 랭킹 구분을 위해 유지한다.
ALTER TABLE bungeoppang_v4_rounds
    ADD COLUMN manual_paused_at TIMESTAMP(3) NULL,
    ADD COLUMN manual_paused_ms BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN manual_pause_revision BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_bungeoppang_manual_pause
        CHECK (manual_paused_ms >= 0 AND manual_pause_revision >= 0);
