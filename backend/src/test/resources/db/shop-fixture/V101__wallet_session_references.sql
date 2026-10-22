-- 테스트 전용 공통 지갑 경계. 이미 적용된 V99의 체크섬은 유지한다.
-- 실제 공통 지갑 스키마는 ERD의 BIGINT NULL 두 컬럼을 제공해야 한다.
ALTER TABLE wallet_transactions
    ADD COLUMN game_session_id BIGINT NULL,
    ADD COLUMN minigame_session_id BIGINT NULL;
