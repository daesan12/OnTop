-- M08 전용 opt-in 경로. 공통 Flyway 버전 순서 합의 전 기존 DB에 적용하지 않는다.
CREATE TABLE anonymous_notes (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    body VARCHAR(300) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    INDEX ix_anonymous_notes_latest (created_at DESC, id DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE anonymous_note_requests (
    request_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    body_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    note_id BIGINT NOT NULL,
    accepted_at TIMESTAMP(3) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    INDEX ix_note_requests_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE anonymous_note_rates (
    subject_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    read_after TIMESTAMP(3) NULL,
    write_after TIMESTAMP(3) NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    INDEX ix_note_rates_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE anonymous_note_board (id BIGINT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO anonymous_note_board (id) VALUES (1);
