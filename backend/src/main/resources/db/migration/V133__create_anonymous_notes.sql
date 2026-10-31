-- 익명 메모(S15P31B105-296) 스키마를 공통 경로에서 생성한다.
-- 기존 db/notes/V121(테이블 4개)과 V129(category·revision 컬럼과 CHECK)를 순서대로 적용한 최종 스키마와 같다.
-- db/notes는 이미 V132 이상인 DB에 out-of-order 없이 추가할 수 없으므로 실행 경로에 넣지 않는다.
-- 메모 테이블이 없는 DB 전용이다. 이미 V121/V129나 메모 테이블이 있는 DB는 배포 전에 별도 편입 절차를 정한다.
CREATE TABLE anonymous_notes (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    body VARCHAR(300) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    category VARCHAR(16) NOT NULL DEFAULT 'free',
    INDEX ix_anonymous_notes_latest (created_at DESC, id DESC),
    CONSTRAINT ck_anonymous_note_category CHECK (category IN ('daily','cheer','worry','recommend','free'))
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

-- 작성과 같은 트랜잭션에서 revision을 올린다. 본문/작성자/요청 키 없음.
CREATE TABLE anonymous_note_board (
    id BIGINT NOT NULL PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_note_board_revision CHECK (revision >= 0)
) ENGINE=InnoDB;
INSERT INTO anonymous_note_board (id) VALUES (1);
