-- 붕어빵 v4 Story 3: 최종 의미 요청과 정산 귀속 시점을 판 원본에 고정한다.
-- 상세 응답과 제출 원본은 기존 bungeoppang_records에, 멱등 응답은 V125 영수증에 저장한다.
ALTER TABLE bungeoppang_v4_rounds
    ADD COLUMN final_request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN final_through_seq INT NULL,
    ADD COLUMN final_prefix_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN settled_at TIMESTAMP(3) NULL,
    ADD COLUMN reward_date DATE NULL,
    ADD CONSTRAINT ck_bungeoppang_v4_final_seq CHECK (final_through_seq IS NULL OR final_through_seq >= 0),
    ADD CONSTRAINT ck_bungeoppang_v4_final_all_or_none CHECK (
        (final_request_hash IS NULL AND final_through_seq IS NULL AND final_prefix_hash IS NULL
            AND settled_at IS NULL AND reward_date IS NULL)
        OR
        (final_request_hash IS NOT NULL AND final_through_seq IS NOT NULL AND final_prefix_hash IS NOT NULL
            AND settled_at IS NOT NULL AND reward_date IS NOT NULL)
    );
