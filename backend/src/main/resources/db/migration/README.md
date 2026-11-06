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
S15P31B105-89의 `V2__create_refresh_tokens.sql`은 users FK를 가진 Refresh 해시 테이블만 추가한다.
S15P31B105-63의 `V3__add_refresh_token_rotation.sql`은 Refresh 회전 시각과 CHECK를 추가한다.
기존 V2 행은 rotated_at=NULL로 유지하며 V1/V2의 SQL·체크섬을 변경하지 않는다.
JWT/Refresh 원문·서명 키·DB 사용자 설정은 SQL에 포함하지 않는다.
이 Markdown 파일은 SQL migration으로 실행되지 않는다.
이미 V1이 적용된 DB에서는 Flyway가 체크섬을 검증하고 재적용하지 않는다.
V4__create_wallets.sql은 공통 wallets/wallet_transactions와 잔액 CHECK·FK·멱등 키를 추가한다.
기존 회원 데이터 지급은 migration에서 수행하지 않고 명시적 initializeWallets 관리 명령으로 분리한다.
신규 온보딩은 회원·100코인 지갑·SIGNUP_BONUS 원장·Refresh를 같은 트랜잭션에 저장한다.
선택적 Shop V100은 기본 위치와 분리하며 기존 테스트 V99/V101은 보존하되 신규 실행 위치에서 제외한다.
기존 fixture DB는 초기화하지 않고 새 격리 DB에서 검증한다. 상세 절차는 docs/wallet-initialization.md를 따른다.
S15P31B105-140의 `V5__create_behavior_events.sql`, `V6__create_world_position_samples.sql`은 행동 로그 테이블을 추가한다.
회원 FK 없이 분석용 기록만 저장하며 설계와 유실 기준은 docs/behavior-log.md를 따른다.
GAME Story 1의 `V112__create_game_sessions_and_participants.sql`은 경기·참가자와 Wallet 경기 FK를 추가한다.
선택적 Minigame V111을 포함한 전체 버전 순서를 확인해 V112를 사용한다.
기존 고버전 DB의 누락 V5/V6와 선택 모듈 추가는 별도 편입 검토 대상이며 자동 repair/out-of-order를 켜지 않는다.
격리 신규 DB 적용 및 시작 예약 계약, 후속 정산/복구 범위는 docs/game-start-persistence.md를 따른다.

S15P31B105-296의 `V133__create_anonymous_notes.sql`은 이전 `db/notes` V121·V129의 최종 익명 메모 스키마를
공통 경로에서 만든다. `db/notes`·`db/feedback` 폴더는 실행 경로에 추가하지 않는다(각 폴더 README 참고).

S15P31B105-232의 `V142__create_admin_wallet_grants.sql`은 전 회원 일괄 엽전 지급 배치와 회원별 원장 연결
감사 기록을 추가한다. V141은 동시 작업 담당자가 먼저 배포하며, V142를 그보다 먼저 운영 DB에 적용하지 않는다.

S15P31B105-352의 `V153__create_event_awards.sql`은 이벤트 회차·상품 슬롯·당첨 결과·암호화 연락처·
결과 확정 실행 기록을 추가한다. 기존 응모권 구매 데이터는 변경하지 않는다. 배포 전 V153 번호를
다른 팀의 동시 작업과 조율한다. 관계 및 검증 기준은 `docs/event-awards-schema.md`를 따른다.

S15P31B105-356의 `V155__create_event_contact_audit.sql`은 최초 제출·만료 메타데이터와 관리자 원문 조회
감사 기록을 추가한다. 기존 연락처가 있으면 14일 보관 상한을 적용하고 제출 메타데이터를 복사한다.
전화번호 원문·암호화 키는 migration에 포함하지 않는다. 연락처 API 계약은 `docs/event-winner-contacts.md`를 따른다.

users의 collation·시각·탈퇴 데이터 보존 및 실제 MySQL 테스트는
저장소 루트의 `docs/users-schema.md`를 따른다.

DB 준비·환경변수·실행·검증 방법은 저장소 루트 `README.md`의 MySQL + Flyway 항목을 따른다.
