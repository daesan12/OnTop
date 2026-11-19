-- 공개 추첨 행사 S1: 2026-11-16 회차를 행사 회차(READY)로 등록하고 판매 마감을 11/19 00:00 KST로 당긴다.
-- 11/09 회차의 응모권도 같은 추첨에 포함하도록 연결하되, 응모권·응모 번호·지갑 거래는 변경하지 않는다.
-- 아래 시각 리터럴은 모두 UTC다. 실행 연결의 설정과 관계없이 같은 시각이 저장되도록 세션 시간대를 고정한다.
SET time_zone = '+00:00';

-- 행사 회차(11/16) 등록. 등록 자체가 직접 확정 잠금의 근거이며 Feature Flag와 무관하다. 진행 상태는 S3에서 확장한다.
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

-- 행사 추첨에 포함할 주차. 주차가 행사에 속하면 그 주차의 직접 사전 추첨·확정이 잠긴다.
-- raffle_round_id가 NULL이면 연결 실패(회차 없음 또는 이미 확정)이며, 행사 회차의 통합 추첨을 진행하지 않는다.
CREATE TABLE raffle_live_event_rounds (
    live_event_id BIGINT NOT NULL,
    week_start_date DATE NOT NULL,
    raffle_round_id BIGINT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT pk_raffle_live_event_rounds PRIMARY KEY (live_event_id, week_start_date),
    CONSTRAINT uk_raffle_live_event_rounds_week UNIQUE (week_start_date),
    CONSTRAINT uk_raffle_live_event_rounds_round UNIQUE (raffle_round_id),
    CONSTRAINT fk_raffle_live_event_rounds_event FOREIGN KEY (live_event_id) REFERENCES raffle_live_events(id),
    CONSTRAINT fk_raffle_live_event_rounds_round FOREIGN KEY (raffle_round_id) REFERENCES raffle_rounds(id)
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_bin;

-- 행사 추첨 후보는 여러 회차의 응모권을 함께 담는다. 후보의 회차는 행사 회차로 기록하고,
-- 응모권 소유자 무결성은 (응모권, 회원) 외래키로 유지한다. 새 외래키를 먼저 만든 뒤 기존 외래키를 지운다.
ALTER TABLE raffle_tickets ADD CONSTRAINT uk_raffle_tickets_id_user UNIQUE (id, user_id);
ALTER TABLE event_raffle_draw_picks ADD CONSTRAINT fk_event_raffle_draw_picks_ticket_user
    FOREIGN KEY (raffle_ticket_id, user_id) REFERENCES raffle_tickets(id, user_id);
ALTER TABLE event_raffle_draw_picks DROP FOREIGN KEY fk_event_raffle_draw_picks_ticket_owner;

-- 회차가 없으면 마감이 반영된 11/16 회차를 만든다(판매 시작 11/16 09:00 KST, 종료 11/19 00:00 KST).
-- 회차가 있으면 기존 주간 종료값(11/23 00:00 KST)일 때만 바꾸고, 예상과 다른 값은 덮어쓰지 않는다.
-- 적용 결과는 마이그레이션 성공 여부가 아니라 infra/app/verify-raffle-live-event-db.sh로 판정한다.
INSERT INTO raffle_rounds(week_start_date, sales_starts_at, sales_ends_at, sales_status)
VALUES ('2026-11-16', '2026-11-16 00:00:00.000', '2026-11-18 15:00:00.000', 'SCHEDULED')
ON DUPLICATE KEY UPDATE sales_ends_at = IF(
    sales_ends_at = '2026-11-22 15:00:00.000', '2026-11-18 15:00:00.000', sales_ends_at);

-- 판매 종료값과 관계없이 확정 잠금을 먼저 적용한다.
INSERT INTO raffle_live_events(raffle_round_id, status, registration_source)
SELECT id, 'READY', 'MIGRATION' FROM raffle_rounds WHERE week_start_date = '2026-11-16';

INSERT INTO raffle_live_event_rounds(live_event_id, week_start_date, raffle_round_id)
SELECT e.id, r.week_start_date, r.id
FROM raffle_live_events e JOIN raffle_rounds r ON r.id = e.raffle_round_id
WHERE r.week_start_date = '2026-11-16';

-- 11/09 회차는 존재하고 아직 최종 확정되지 않았을 때만 연결한다. 확정된 결과는 바꾸지 않고 연결 실패로 남긴다.
INSERT INTO raffle_live_event_rounds(live_event_id, week_start_date, raffle_round_id)
SELECT e.id, DATE '2026-11-09', (
    SELECT s.id FROM raffle_rounds s
    WHERE s.week_start_date = '2026-11-09'
      AND NOT EXISTS (
          SELECT 1 FROM event_rounds f
          WHERE f.event_type = 'RAFFLE' AND f.raffle_round_id = s.id AND f.finalized_at IS NOT NULL))
FROM raffle_live_events e JOIN raffle_rounds r ON r.id = e.raffle_round_id
WHERE r.week_start_date = '2026-11-16';
