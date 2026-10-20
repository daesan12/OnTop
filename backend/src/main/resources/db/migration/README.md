# Flyway migration 규칙

- 위치: `backend/src/main/resources/db/migration/` (`classpath:db/migration`).
- 파일명: `V<양의 정수>__<lower_snake_case_설명>.sql`. `V`는 대문자이고 구분자는 밑줄 두 개다.
- 버전은 프로젝트 전체에서 하나의 순서를 공유한다. MR 작성 전에 `dev`의 최신 버전을 확인하고,
  동시에 작업하는 담당자와 다음 번호를 조율한다. 도메인별로 번호를 다시 시작하지 않는다.
- 첫 실제 스키마 변경은 `V1`부터 시작하고 이후 새 버전을 추가한다. 이미 적용된 파일은 수정하거나 삭제하지 않는다.
- SQL은 UTF-8로 저장한다. DB 생성과 계정·비밀번호 설정은 migration 밖에서 준비한다.
- JPA는 `ddl-auto: validate`, 기본 SQL 초기화는 `never`다. 스키마 변경은 Flyway로 관리한다.
- `baseline-on-migrate`는 `false`다. 기존 데이터가 있는 DB는 스키마와 이력 편입 절차를 별도로 검토한다.

S15P31B105-80의 첫 migration은 `V1__create_users.sql`이며 `users`만 생성한다.
이 Markdown 파일은 SQL migration으로 실행되지 않는다.
이미 V1이 적용된 DB에서는 Flyway가 체크섬을 검증하고 재적용하지 않는다.
Wallet·UserItems·GameSessions 등 다른 도메인은 이후 별도 migration으로 추가한다.

users의 collation·시각·탈퇴 데이터 보존 및 실제 MySQL 테스트는
저장소 루트의 `docs/users-schema.md`를 따른다.

DB 준비·환경변수·실행·검증 방법은 저장소 루트 `README.md`의 MySQL + Flyway 항목을 따른다.
