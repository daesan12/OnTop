# 이전 익명 메모 마이그레이션 경로

`V121__create_anonymous_notes.sql`과 `V129__add_note_category_and_board_revision.sql`은 격리 테스트 DB에서
사용한 opt-in 경로다. 공유 DEV·PROD의 Flyway locations에는 포함된 적이 없다.

S15P31B105-296부터 두 파일을 순서대로 적용한 최종 스키마를 공통
`db/migration/V133__create_anonymous_notes.sql`이 만든다. 이 폴더의 파일은 수정·삭제하지 않고 참고용으로 둔다.

`classpath:db/notes`를 Flyway locations에 추가하지 않는다. V132 이상이 적용된 DB에서는 낮은 버전이
out-of-order로 남아 검증이 실패하고, V133과 같은 테이블을 중복 생성한다. 이미 V121/V129나 메모 테이블이
있는 DB는 V133 배포 전에 `infra/app/verify-notes-db.sh`로 확인하고 별도 편입 절차를 정한다.
