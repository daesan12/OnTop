-- 공개 추첨 행사 S1: 2026-11-16 회차의 판매 마감을 11/19 00:00 KST로 당기고,
-- 이 회차를 공개 추첨 행사 대상(READY)으로 등록해 관리자 직접 확정을 막는다.
-- 아래 시각 리터럴은 모두 UTC다. 실행 연결의 설정과 관계없이 같은 시각이 저장되도록 세션 시간대를 고정한다.
SET time_zone = '+00:00';

-- 행사 진행 상태는 S3에서 확장한다. 등록 자체가 직접 확정 잠금의 근거이며 Feature Flag와 무관하다.
CREATE TABLE raffle_live_events (
    id BIGINT NOT NULL AUTO_INCREMENT,
    raffle_round_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'READY',
    registration_source VARCHAR(16) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT pk_raffle_live_events PRIMARY KEY (id),
    CONSTRAINT uk_raffle_live_events_round UNIQUE (raffle_round_id),
    CONSTRAINT fk_raffle_live_events_round FOREIGN KEY (raffle_round_id) REFERENCES raffle_rounds(id),
    CONSTRAINT ck_raffle_live_events_status CHECK (status IN ('READY', 'RUNNING', 'PAUSED', 'COMPLETED')),
    CONSTRAINT ck_raffle_live_events_source CHECK (registration_source IN ('MIGRATION', 'DEV_MANUAL'))
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_bin;

-- 회차가 없으면 마감이 반영된 회차를 만든다(판매 시작 11/16 09:00 KST, 종료 11/19 00:00 KST).
-- 회차가 있으면 기존 주간 종료값(11/23 00:00 KST)일 때만 바꾸고, 예상과 다른 값은 덮어쓰지 않는다.
-- 적용 결과는 마이그레이션 성공 여부가 아니라 infra/app/verify-raffle-live-event-db.sh로 판정한다.
INSERT INTO raffle_rounds(week_start_date, sales_starts_at, sales_ends_at, sales_status)
VALUES ('2026-11-16', '2026-11-16 00:00:00.000', '2026-11-18 15:00:00.000', 'SCHEDULED')
ON DUPLICATE KEY UPDATE sales_ends_at = IF(
    sales_ends_at = '2026-11-22 15:00:00.000', '2026-11-18 15:00:00.000', sales_ends_at);

-- 판매 종료값과 관계없이 확정 잠금을 먼저 적용한다.
INSERT INTO raffle_live_events(raffle_round_id, status, registration_source)
SELECT id, 'READY', 'MIGRATION' FROM raffle_rounds WHERE week_start_date = '2026-11-16';
