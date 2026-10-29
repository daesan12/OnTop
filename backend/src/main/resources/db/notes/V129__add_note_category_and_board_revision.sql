-- 사용자 승인: 로컬 작성/격리 DB 검증만. 팀 버전·적용 순서 확인 전 푸시/공용 DB 적용 금지.
ALTER TABLE anonymous_notes
    ADD COLUMN category VARCHAR(16) NOT NULL DEFAULT 'free',
    ADD CONSTRAINT ck_anonymous_note_category CHECK (category IN ('daily','cheer','worry','recommend','free'));

-- 기존 게시판 행 잠금 아래 작성과 같은 트랜잭션에서 증가한다. 본문/작성자/요청 키 없음.
ALTER TABLE anonymous_note_board
    ADD COLUMN revision BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_note_board_revision CHECK (revision >= 0);
