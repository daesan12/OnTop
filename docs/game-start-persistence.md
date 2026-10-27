# 경기 시작 영속화 및 참가비 예약 · GAME Story 1

2026-10-26 후속: [가변 참가비·정상 종료 정산](game-settlement.md)이 현재 계약이다.
selector가 GAME_SELECT로 확정한 B를 예약한다. V122가 기존 1코인 CHECK를 확장하며 V112는 보존한다.
아래 Story 1 당시 검증 이력은 과거 결과로 유지한다.

## 범위와 실행 조건

`GameStartGateway`의 실제 DB 구현은 `JpaGameStartGateway`다.
`db` 프로필과 `ontop.game-start.enabled=true`를 함께 사용해야 등록된다.
기존 local rehearsal의 문자열 경기 ID와 `LocalGameStartGateway`는 변경하지 않는다.
실제 엔진 연결은 기존 `CommittedGameStartService`의 local/dev 조건(prod/production 제외)과 게임별 활성화 설정을 따른다.
기본값이나 dev의 게임 활성화 설정은 이번 작업에서 바꾸지 않는다.

Story 1은 **예약 커밋** 경계다. Story 173에서 정상 종료 정산·예약 해제를 연결했다.
무효 반환, 엔진 생성 확인, 종료 이벤트 재전달, 재시작 복구는 Story 174에 남아 있다.
실사용 DB에서 임의로 게임 시작 옵션을 켜거나 예약 행을 수동 삭제하지 않는다.

## 저장 모델

- `game_sessions`: BIGINT PK, 별도 UUID startAttemptId UNIQUE, SHA-256 요청 fingerprint,
  tableId/version, gameCode/targetScore, 최초 인원/판돈, 상태/정산 상태/거절 코드,
  종료 이벤트 ID/hash/version과 결과 version, 정산 정책/보너스 필드,
  실행 instance/boot ID, 생성·예약·시작·종료·정산 시각.
- `game_participants`: 최초 회원·좌석·참가 순서, 상태/결과/이탈 정보,
  최초 예약액 B, 최종 순증감, 예약 해제 시각.
- User·경기 FK와 경기 내 회원/좌석/참가 순서 UNIQUE를 적용한다.
- nullable 생성 컬럼 `active_user_id`의 UNIQUE는 예약 해제 전까지 다른 경기 참가를 막는다.
  중도 이탈 상태가 되어도 예약 해제 전에는 제한을 유지한다.
- nullable 생성 컬럼 `active_table_id`의 UNIQUE는 정산/무효 환불 완료 전 중복 테이블 시작을 막는다.
- 기존 `wallet_transactions.game_session_id`에 경기 FK를 추가한다.
  기존 Wallet의 `(wallet_id, id)` 조회 인덱스와 원장 멱등 키는 유지한다.
- 게임 인원/코드, 주사위 목표, 판돈/전체 판돈, 좌석/상태 등은 CHECK로도 검증한다.
- 시각은 UTC `TIMESTAMP(3)`이며 JPA는 `validate`만 사용한다.

`PREPARING`은 같은 트랜잭션 안에서 시도 UNIQUE를 확보하는 중간 상태다.
정상 경로는 반드시 `RESERVED/PENDING` 또는 `REJECTED/NULL`로 전환한 뒤 커밋한다.
예외 시 PREPARING 행과 참가자·지갑·원장은 모두 롤백된다.
엔진 성공 확인 전이므로 `started_at`은 NULL이다.

`GAME_INSTANCE_ID`는 선택 설정(기본 `single-instance`, 영문/숫자/밑줄/하이픈 1~64자)이다.
boot ID는 영속 서비스 인스턴스 생성 시 발급한다.
이 식별자만으로 다른 프로세스의 사망이나 복구 권한을 판정하지 않는다.
lease/fencing 및 엔진 활성화 승인 계약은 Story 3에서 추가해야 한다.

## ID와 요청 fingerprint

- DB 경기 PK는 양수 BIGINT, `GameStartResult.gameSessionId`와 엔진 gameId는 같은 십진수 String이다.
- 변환은 DB 경계의 `GameIdCodec`에서만 한다. 선행 0, 부호, 공백, 범위 초과를 거절한다.
- startAttemptId는 별도 UUID다. 테이블 ID를 경기 ID로 사용하지 않는다.
- fingerprint 규격 1은 길이가 명확한 바이너리 직렬화 후 SHA-256을 계산한다.
  tableId/version, gameCode, targetScore, 요청 순서대로 회원 ID/좌석을 포함한다.
  참가자 순서도 기존 성공 응답 계약의 일부다. DB 조회 시 `participant_order`로 재현한다.
- 잠금 순서는 회원 ID 오름차순이며 응답 참가 순서와 무관하다.
- DB 어댑터는 OMOK/DICE 2명, ONE_CARD/LIAR_BRIDGE 2~4명,
  DICE 목표 2000/4000/6000, 정규 양수 내부 회원 ID를 검증한다.
- 구조가 잘못된 내부 요청은 DB 접근 전에 IllegalArgumentException으로 거절한다.
  유효한 요청의 업무 거절 결과는 영속화한다.
- tableId는 DB 경계에서 최대 120자다. 현재 행동 로그의 tableId 상한은 64자이므로
  장기 공통 상한 합의가 필요하며, 이 작업에서 실시간/행동 로그 계약은 바꾸지 않는다.

## 트랜잭션과 잠금

`GameStartPersistenceService.reserve`는 별도 프록시의
`REQUIRES_NEW / READ_COMMITTED` 트랜잭션이다. Gateway는 커밋 이후에만 성공을 반환한다.

1. 같은 startAttemptId 결과와 fingerprint 확인.
2. 시도 UNIQUE 확보.
3. 회원 ID 오름차순 User 공유 잠금, 활성 상태 확인.
4. 같은 순서의 Wallet 쓰기 잠금. 지갑이 없으면 생성하지 않음.
5. 활성 테이블/참가 중복 및 `balance - reserved >= B` 확인.
6. 경기 RESERVED, 최초 참가자와 각 Wallet의 예약액 +B 저장.
7. 회원별 `GAME_RESERVE(balanceDelta=0, reservedDelta=B)` 저장.
8. 전체 커밋.

원장 키는 `game:<gameId>:reserve:<userId>`이며 기존 글로벌 UNIQUE를 사용한다.
balance는 바뀌지 않으며 가입 지급이나 정산은 실행하지 않는다.

기존 Shop·Minigame은 Wallet을 먼저 잠근다. 이들의 users FK 공유 잠금과 호환되도록
게임은 User를 변경하지 않는 공유 잠금을 사용한다. 탈퇴는 User 쓰기 잠금이므로
먼저 잠근 트랜잭션의 결과를 기다린다. 예약이 먼저 커밋된 뒤 탈퇴하면 예약은 유지되며,
기존 이탈/향후 최종 정산 경로로 처리해야 한다. 탈퇴가 먼저면 신규 예약은 거절된다.
이 작업에서 Shop·Minigame·탈퇴 서비스의 잠금 순서는 변경하지 않는다.

## 결과·멱등성·장애

| 결과 | 의미 |
|---|---|
| RESERVED | 전원 예약과 원장 커밋 완료, 동일 시도 재호출/조회는 같은 결과 |
| REJECTED | 참가/예약 없음이 확정된 업무 거절, 같은 시도는 조건이 바뀌어도 같은 거절 |
| CONFLICT | 같은 startAttemptId의 다른 fingerprint, 기존 결과는 유지 |
| PENDING | 미확인 시도 또는 DB/커밋 결과 불명, 같은 시도 조회 필요 |

업무 거절 코드는 `MEMBER_NOT_ACTIVE`, `WALLET_NOT_READY`, `INSUFFICIENT_BALANCE`,
`MEMBER_ALREADY_IN_GAME`, `TABLE_ALREADY_IN_GAME`이다. 기존 Hub는 클라이언트에게
회원별 잔액이나 DB 원문을 전달하지 않고 기존 시작 상태 계약으로 변환한다.

동시 UNIQUE 충돌은 실패한 트랜잭션 밖에서 기존 시도를 다시 읽는다.
활성 테이블/참가 UNIQUE 충돌임이 확인되면 **예약 없이 거절만** 별도 트랜잭션에 저장한다.
알 수 없는 제약/저장/커밋 실패는 PENDING이며 자동 재예약하지 않는다.
SQL 예외 원문과 파라미터는 로그에 출력하지 않는다.

`findStartResult`는 저장된 최초 시작 결과만 조회한다. 예약·원장·엔진 생성은 하지 않는다.
호출 측 기존 `CommittedGameStartService.find()`는 성공 결과로 엔진 생성을 다시 시도한다.
향후 무효 환불을 구현할 때 반드시 활성화 승인/취소 fencing을 함께 연결해야 한다.
최초 RESERVED 이력을 단순히 새 예약 명령으로 취급하거나 환불된 엔진을 재생성하면 안 된다.

## Flyway 안전 적용

파일: `db/migration/V112__create_game_sessions_and_participants.sql`.
기본 V1~V6, 선택적 Shop V100, Minigame V110/V111을 확인해 전체 버전 규칙상 112를 사용했다.
기존 적용 SQL, baseline, out-of-order, repair, history는 변경하지 않는다.

새 격리 DB의 검증 조합:

- 기본: `classpath:db/migration`
- Shop: 기본 + `classpath:db/shop`
- Minigame: 기본 + Shop + `classpath:db/minigame`

기존 고버전 DB에 V5/V6가 없으면 out-of-order/validation 문제가 선행한다.
V112를 추가했다고 이 문제가 해결되지 않는다. 적용 승인 전 해당 DB를 앱 실행 대상으로 쓰지 않는다.
V112 적용 뒤에 낮은 버전 선택 모듈을 새로 켜는 경우도 별도 편입 절차가 필요하다.
기존 `wallet_transactions.game_session_id IS NOT NULL` 값은 경기 FK 추가 전에
참조 정합성을 점검해야 한다. 잘못된 참조를 자동 삭제/보정하지 않는다.
MySQL DDL은 파일 전체 원자성이 없으므로 실패 시 자동 재실행/repair하지 않고
실제 생성 상태와 실패 이력을 확인해 별도 복구 절차를 결정한다.

## 관련 검증 명령

Java 21, 새 격리 DB의 접속 환경변수를 먼저 주입한다. 비밀값은 명령/문서에 적지 않는다.
게임 통합 테스트는 `TEST_GAME_DB_URL/USERNAME/PASSWORD`를 사용하고,
URL은 `jdbc:mysql://127.0.0.1:<port>/ontop_game_test_<고유값>`만 허용한다.
기존 회귀 테스트는 각각 TEST_DB, TEST_SHOP_DB, TEST_MINIGAME_DB 전용 변수와 새 DB를 사용한다.

```powershell
.\gradlew.bat test --tests 'com.ssafy.ontop.game.start.*' --tests 'com.ssafy.ontop.table.CommittedStartContractTests' --tests 'com.ssafy.ontop.table.CommittedStartFlowTests' --console=plain
.\gradlew.bat mysqlTest --tests 'com.ssafy.ontop.game.start.GameStartMySqlTests' --console=plain
git diff --check
```

전체 회귀는 GAME 도메인 MR 직전에 실행한다.

### Story 1 검증 결과 · 2026-10-23

현재 GAME 브랜치 기준 선택 실행 결과:

| 구분 | 통과 | 실패 | 건너뜀 |
|---|---:|---:|---:|
| 신규 요청/Gateway 단위 및 기존 local 시작·Wallet·Shop | 78 | 0 | 0 |
| GameStartMySqlTests | 25 | 0 | 0 |
| 스키마/FK 영향 관련 기존 MySQL 회귀 | 152 | 0 | 0 |
| 합계 | 255 | 0 | 0 |

기존 MySQL 회귀는 WalletMySqlTests, WalletTransactionsMySqlTests, WalletBalanceShopMySqlTests,
WalletPersistenceProfilesMySqlTests, UsersMySqlTests, ShopMySqlTests, MinigameMySqlTests,
AuthExchangeMySqlTests, AuthRefreshMySqlTests, AuthLogoutMySqlTests,
RestAuthenticationMySqlTests, UserOnboardingMySqlTests를 선택 실행했다.
기본/local/dev의 DB 없는 실행, 세 가지 신규 DB migration 조합, JPA validate와 재실행을 확인했다.
MySQL은 8.4.11이며 기존 테스트 서버 안의 신규 격리 DB 네 개만 사용했다.
실패 트리거 검증은 기존 테스트 관리 계정을 사용했고 서버 전역 설정과 권한을 바꾸지 않았다.
테스트용 접속 정보/비밀값은 소스에 기록하지 않는다.

기존 ontop_dev(V1~V4), 기본 테스트 DB(V1~V4), Shop 테스트 DB(V100), Minigame 테스트 DB(V110)의
이력이 작업 전후 동일함을 SELECT로 확인했으며 이 DB들에는 V112를 적용하지 않았다.
전체 회귀와 실제 배포 DB 적용은 미실시다.

fetch 시점 origin/dev에는 현재 브랜치 이후 Minigame dev 활성화 관련 커밋 세 개가 있었다.
브랜치/이력을 보존해 통합하지 않았으며, 해당 변경을 통합한 최종 검증은 도메인 MR 전에 필요하다.

## Story 2·3 경계

- 종료 이벤트 보존·중복/역전 검증, 승패·공동 승리 보너스 정산 및 결과 조회.
- 경기 전체 정산/무효 환불 시 예약과 active user/table 제한을 함께 해제.
- 결과 outbox, GAME_SETTLED 분석 이벤트의 업무 중복 제거.
- 종료 결과 재전달/수신 확인, 활성화 승인, 엔진 유실 복구 및 다중 실행 fencing.
- 종료 후에도 soft delete 회원의 기존 재화와 기록은 보존하며 최종 정산 대상에서 제외하지 않음.

게임 엔진의 승패·턴·기권 규칙과 TableHub는 이 Story에서 수정하지 않는다.
