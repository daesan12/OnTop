# GAME Epic 171 · 가변 참가비와 정상 종료 정산 (Story 172 보완 / 173)

## 참가비 설정 계약

테이블은 기존처럼 서버가 미리 만든다. 별도 방장/방 생성 API를 추가하지 않는다.
현재 `selectorUserId`만 WAITING에서 게임·참가비·주사위 목표를 설정할 수 있다.

```json
{"requestId":"select-1","type":"GAME_SELECT","payload":{"gameCode":"DICE","targetScore":4000,"betAmountPerPlayer":5}}
```

- `betAmountPerPlayer`: 필수 양의 정수. 문자열·소수·0·음수·누락은 INVALID_PAYLOAD.
- DICE는 기존 targetScore 2000/4000/6000 필수, 다른 게임에는 targetScore를 보내지 않는다.
- 지원되는 정수지만 게임 금액 범위를 벗어나면 GAME_INVALID_BET. 실패 시 기존 선택·준비·version 유지.
- TABLE_STATE, TABLE_WATCH_STATE, GET /api/v1/tables의 각 항목에 nullable betAmountPerPlayer 추가.
  미선택/빈 테이블은 null. 서버 확정값을 모든 참가자에게 보여 주고 나서 READY_SET을 보낸다.
- 게임·참가비·목표 중 하나가 바뀌면 전원 준비=false, version 증가. 동일 설정 재요청은 유지.
- selector가 나가면 기존 순서로 권한을 승계하고 금액은 유지한다. 테이블이 비면 금액도 지운다.
- STARTING/CONFIRMED/PLAYING/SETTLING에서는 변경할 수 없다. 경기 종료 뒤에도 금액을 유지한다.
- 거절은 기존 TABLE_BUSY 또는 인증 경기 복구 선행 검사 GAME_RECOVERY_REQUIRED를 따른다.
- 기존 FE의 금액 없는 GAME_SELECT는 더 이상 성공하지 않는다. 묵시적인 1코인 기본값은 없다.
  기존 요청에 금액을 추가하고 응답 필드를 반영해 FE/BE를 함께 배포해야 한다.
- GAME_START_STATE, GAME_RESULT, 게임 입력 JSON의 기존 필드는 유지한다.

FE 구현은 GameControls에 금액 입력·적용 및 확정 금액 표시를 추가하고,
gameSelection / ParkRuntime.selectGame(code, betAmountPerPlayer, targetScore?)로 전달한다.
금액 미확정 상태에서 준비를 허용하지 않는다. 기존 서버의 필드 누락을 1코인으로 추정하지 않는다.

### 준비 요청의 참가비 동의 (FE 필수 변경)

```json
{"requestId":"ready-1","type":"READY_SET","payload":{"ready":true,"betAmountPerPlayer":5,"expectedVersion":12}}
```

ready=true는 사용자가 확인한 TABLE_STATE의 참가비와 version을 필수로 보낸다.
ready=false는 기존 `{"ready":false}`만 보낸다. 누락/형식 오류는 INVALID_PAYLOAD,
현재 참가비 불일치는 GAME_BET_CHANGED, 오래되거나 미래 version은 GAME_SETTINGS_CHANGED다.
오류 시 기존 준비 상태를 유지한다. 최신 금액·상태 표시 후 사용자에게 다시 준비를 요청한다.

기존 TABLE_STATE.version을 재사용하며, 마지막 전원 준비 초기화 시점의 버전만 내부에 기록한다.
그 시점 이상/현재 이하의 observed version을 허용한다. 다른 참가자의 준비 변경에는 관대하고,
게임·목표·참가비·참가자 변경 전 요청은 거절한다. 100→500→100의 ABA도 최초 버전으로 구분한다.
동의 검증·준비 변경·게임 시작 판정은 같은 Hub 상태 잠금 안에서 수행한다.
새 공개 버전 필드/DB 컬럼은 필요 없다. FE는 서버 오류에 새 버전으로 자동 동의하지 않는다.

### FE 팀 검토용 파일별 변경 및 호환성

아래 목록은 Story 173에서 이미 반영한 변경이다. 커밋 전 실패 로그 보완 과정에서는 FE 파일을 추가 수정하지 않는다.

| 파일 (frontend/ 기준) | 기존 변경 내용 및 검토 영향 |
|---|---|
| src/features/tableLobby/model.ts | gameSelection(code, betAmountPerPlayer, targetScore?)로 서명 변경. 양수 안전 정수와 게임 최대 인원 기준 판돈 검사. 참가비 미확정 시 준비 금지 |
| src/game/OmokPanel.tsx | GameControls에 참가비 입력·적용·서버 확정 금액 표시. selector만 설정 가능. 기존 게임판/턴/승패 UI 규칙은 유지 |
| src/network/protocol.ts | TableSummary/TableState에 nullable betAmountPerPlayer. 이전 서버의 필드 생략은 null로 해석하며 1코인으로 추정하지 않음 |
| src/park/runtime/SpringParkRuntime.ts | GAME_SELECT에 B 전달. READY_SET true에 서버 상태의 B/version 전달, false는 ready만 전달. selectOmok도 확정 B가 없으면 실패 |
| src/park/runtime/contracts.ts | ParkRuntimePort.selectGame의 필수 두 번째 인자를 참가비로 변경. 기존 DICE의 두 번째 targetScore는 세 번째로 이동 |
| tests/unit/movementRuntime.test.ts | 이동/퇴장 관련 TABLE_STATE·테이블 목록 fixture에 nullable B 추가 |
| tests/unit/publicGameWatch.test.ts | 공개 관전 테이블 fixture에 확정 B 추가 |
| tests/unit/tableGathering.test.ts | 다인 테이블 fixture에 확정 B 추가 |
| tests/unit/tableIdentity.test.ts | 테이블 목록/상태 fixture의 nullable B 반영 |
| tests/unit/tableLobby.test.ts | gameSelection 호출·페이로드 기대값, 금액 경계와 미확정 준비 금지 검증 |
| tests/unit/tableLobbyRuntime.test.ts | GAME_SELECT 금액과 READY_SET 동의 금액·expectedVersion/취소 요청 검증 |
| tests/e2e/contractFixture.ts | Mock이 GAME_SELECT의 B를 저장하고 테이블 목록·상태에 반환. 실제 서버의 동의/정산 검증을 대체하지 않음 |
| tests/e2e/bridge.spec.ts | 게임 선택 전에 참가비를 명시적으로 입력 |
| tests/e2e/farkle.spec.ts | 주사위 게임 선택 전에 참가비를 명시적으로 입력 |
| tests/e2e/m10.spec.ts | 선택 흐름에서 참가비 입력 추가 |
| tests/e2e/manual.spec.ts | 수동 시나리오의 게임 선택 전 참가비 입력 추가 |
| tests/e2e/omok-assets.spec.ts | 자산 UI 시나리오의 오목 선택 전 참가비 입력 추가 |
| tests/e2e/omok-camera.spec.ts | 카메라 시나리오의 오목 선택 전 참가비 입력 추가 |
| tests/e2e/omok-migration.spec.ts | UI 시나리오의 오목 선택 전 참가비 입력 추가 |
| tests/e2e/omok.spec.ts | 선택 전 참가비 입력 및 GAME_SELECT/READY_SET 새 필드 전송 확인 |
| tests/e2e/onecard.spec.ts | 원카드 선택 전에 참가비 입력 추가 |
| tests/e2e/performance.spec.ts | 성능 시나리오의 게임 선택 전 참가비 입력 추가 |
| tests/e2e/prototype-table-ui.spec.ts | 기존 테이블 UI 시나리오의 게임 선택 전 참가비 입력 추가 |
| tests/e2e/table-lobby.spec.ts | selector 문구·금액 입력·DICE 목표/참가비 요청 기대값 갱신 |

**FE/BE 동시 반영이 필요한 요청 계약 변경이다.** 이전 GAME_SELECT의 금액 생략 및
READY_SET true의 {ready:true}만 전송하는 요청은 새 BE에서 INVALID_PAYLOAD다.
구 BE의 엄격한 필드 검사도 새 요청의 추가 필드를 거절하므로 한쪽만 먼저 교체해 호환된다고 볼 수 없다.
이전 selectGame('DICE', 4000)은 새 서명에서 두 번째 인자가 참가비이고 목표 점수가 빠져 거절된다.
반드시 selectGame('DICE', B, 4000)으로 호출부를 검토한다. 다른 게임의 목표 점수는 계속 허용하지 않는다.
GAME_BET_CHANGED/GAME_SETTINGS_CHANGED에는 자동 재시도하지 않고 현재 금액·테이블 상태를 표시한 뒤
다시 동의를 받는다. GAME_START_STATE/GAME_RESULT 및 실제 게임 입력 메시지는 기존 필드를 유지한다.

## 금액 범위 및 예약

GameAmounts가 공통 검증을 담당한다. 금액 저장 타입은 기존 Wallet과 같은 long이다.
공개 GAME_RESULT의 JSON number 계약을 유지하기 위해 최댓값은 9,007,199,254,740,991이다.

- B > 0, 참가 인원 2~4. 선택 시 게임별 최대 인원(2 또는 4)으로 검사한다.
- 실제 시작 시 실제 인원도 검사하고 DB Gateway는 게임 최대 인원 검사를 다시 수행한다.
- B, 전체 판돈 B×N, 모든 가능한 승자 수의 지급액·순증감을 안전 정수 범위로 제한한다.
- multiplyExact/addExact/subtractExact로 long 오버플로를 거절한다.
- Wallet의 balance/전체 reserved 값은 기존 long 범위를 유지한다. 변경 시 산술 오버플로와
  0 <= reserved <= balance를 검사하며 기존 DB CHECK가 최종 보장한다.

서버 TableRoom의 스냅샷 → GameStartCommand(B) → fingerprint → 게임/참가자 → Wallet/원장 순서다.
users 공유 잠금 → userId 오름차순 Wallet 쓰기 잠금과 기존 예약 트랜잭션은 유지한다.
모든 참가자의 available=balance-reserved가 B 이상이어야 한다. balance는 변경하지 않고
reserved만 B 증가시키며 GAME_RESERVE에 reserved_delta=B를 기록한다.

동일 startAttemptId에서 금액이 달라지면 CONFLICT다. B=1의 fingerprint는 기존 규격 1을
유지하고 B!=1은 금액을 포함한 규격 2를 사용한다. 기존 내부 생성자/로컬 픽스처는 B=1과
호환되지만 공개 프로토콜의 금액 생략을 허용하지는 않는다. 조회는 DB에 저장된 B를 재현한다.

## 정상 종료 수신 및 저장

공개 정산 요청 API를 추가하지 않는다. 공통 GameFinished만 DB 정산 입력으로 사용한다.
게임별 기존 종료 이벤트는 통신부가 계속 사용하며 이중 정산 입력으로 구독하지 않는다.

1. GameFinishPersistenceService.accept: REQUIRES_NEW, READ_COMMITTED.
2. gameId는 영속 경계에서 정규 양수 BIGINT로 변환한다. demo-game 문자열 계약은 변경하지 않는다.
3. eventId=gameId:finished, 게임·테이블·최초 참가자 전체·결과·이탈 필드·시각·version 검증.
4. 경기 행 FOR UPDATE. 참가자별 예약액이 DB의 B와 같은지 확인한다.
5. 불변 payload hash로 중복/충돌 판별. 참가자는 userId 순, 시각은 UTC 밀리초로 정규화한다.
6. FINISHED/PENDING, result_version=1 및 최초 참가자 전체 판정을 커밋한다.
7. 별도 GameSettlementPersistenceService.settle 트랜잭션에서 정산한다.

같은 eventId/내용은 중복 성공, 다른 내용은 거절한다. 정산 실패에도 확정된 판정은 PENDING으로 남는다.
재시도는 같은 경기·같은 종료 내용으로 수행하며 새 지급 키를 만들지 않는다.
Story 174의 독립 이탈 수신기와 최종 판정의 일치 검증은 [복구 구현 상태](game-recovery.md)를 따른다.
이탈만으로 예약을 해제하지 않으며 최종 판정 수신 전에는 결과를 확정하지 않는다.

### 판정 수신·정산 실패 로그

GameFinishedPersistenceListener는 수신 트랜잭션 실패를 stage=ACCEPT, 정산 트랜잭션 실패를
stage=SETTLE로 ERROR 기록한 뒤 **동일 예외를 다시 전파**한다. ACCEPT 실패 시 정산을 호출하지 않으며,
리스너가 완료 이벤트를 발행하거나 자동 재시도하지 않는다. 두 단계의 커밋 실패도 해당 단계로 기록한다.

구조화 필드: gameId, eventId, stage, exceptionType, rootCauseType, sqlState, sqlErrorCode.
기본 콘솔에서도 필드를 찾을 수 있도록 같은 key=value 정보를 메시지에 남긴다.
gameId는 정규 양수 BIGINT, eventId는 해당 gameId:finished만 출력하며 잘못된 원문은 INVALID다.
SQL 원인이 없으면 sqlState=NONE/sqlErrorCode=0, 비정상 SQLState 형식은 UNKNOWN이다.
사용자 식별자·참가자 목록·이벤트 payload·SQL/예외 메시지·stack trace는 출력하지 않는다.
예외 원인은 타입과 DB 오류 코드로 구분한다. Story 174에서는 GameEventDelivery가 엔진 이벤트를
비동기로 인계하고 ACK/재전달하며, 같은 단계별 로그를 유지한다.
현재 전달·복구 계약은 [Story 174 구현 상태](game-recovery.md)를 따른다.

현재 정상 종료 코드:

| 게임 | endReason |
|---|---|
| OMOK | FIVE_IN_ROW, BOARD_FULL, TURN_TIMEOUT, RECONNECT_EXPIRED, LOGOUT, MEMBER_DEACTIVATED, EXPLICIT_LEAVE |
| DICE | TARGET_REACHED, RECONNECT_EXPIRED, LOGOUT, MEMBER_DEACTIVATED, EXPLICIT_LEAVE |
| ONE_CARD | EMPTY_HAND, STALEMATE, PLAYER_LEFT |
| LIAR_BRIDGE | THREE_GOALS, LAST_PLAYER_STANDING, GOAL_SLOTS_EXHAUSTED, NO_RUNNABLE_PAWNS |

BOARD_FULL만 전원 DRAW이며 예약 해제한다. STALEMATE와 다리 동점은 공동 WIN이다.
Story 174에서 ABORTED_NO_PLAYERS/전원 FORFEIT는 INVALID로 수신하고 예약만 반환한다.
엔진 판정 없는 INVALID의 참가자 result=null 계약과 FE 반영 대기는 [복구 구현 상태](game-recovery.md)를 따른다.
알 수 없는 사유·상충 결과를 임의 승리/무승부/환불로 바꾸지 않는다.

## 정산·원장

N=최초 참가자 수, B=DB 확정 참가비, P=B×N, W=WIN 수.

```text
bonus = (W - P % W) % W
payoutPerWinner = (P + bonus) / W
승자 순증감 = payoutPerWinner - B
패자/기권자 순증감 = -B
```

원래 participant_order 순서의 승자 중 앞 P%W명은 원래 판돈 몫을 P/W+1,
나머지는 P/W만큼 배분한다. 지급액과 원래 판돈 몫의 차이가 개별 서버 보너스다.
모든 승자의 최종 지급액은 같고, 이 순서는 원장 출처 구분에만 사용한다.

| 유형 | balance_delta | reserved_delta | 멱등 키 |
|---|---:|---:|---|
| GAME_RESERVE | 0 | +B | game:id:reserve:userId |
| GAME_SETTLEMENT | 원래 판돈 몫-B (패자 -B) | -B | game:id:close:userId |
| GAME_TIE_BONUS | 개별 서버 보너스 (양수만 기록) | 0 | game:id:bonus:userId |
| GAME_RELEASE | 0 | -B | game:id:close:userId |

B=5, N=3, W=2이면 P=15/bonus=1/지급액=8이다. 승자A는 정산 +3,
승자B는 정산 +2와 보너스 +1, 패자는 -5다. 순증감 합계는 +1이다.
무승부는 전원 순증감0. 전원 공동 WIN도 순증감0이며 보너스를 만들지 않는다.

경기 행 잠금 → userId 오름차순 Wallet 쓰기 잠금 → Wallet/원장/참가자/경기 상태 저장을
같은 트랜잭션으로 수행한다. 모든 예약 기여분 B를 한 번씩 해제하고 coin_delta를 기록한다.
전체 순증감 합=보너스, 회원별 원장 합=coin_delta, 전체 예약 기여분 합=0을 보장한다.
SETTLED/result_version=2/settled_at을 함께 저장하며 active user/table 제한도 해제된다.
탈퇴한 최초 참가자도 정산 대상이다. 새 Wallet이나 가입 보너스를 생성하지 않는다.

## 조회 및 커밋 알림

JpaGameResultGateway.load는 REQUIRES_NEW/readOnly/REPEATABLE_READ로 결과와 참가자를
동일한 DB 스냅샷에서 읽는다. 본인 참가 기록이 없는/없는/미종료 경기는 empty다.
조회는 정산·원장 쓰기를 실행하지 않는다. DB 장애는 기존 GAME_RESULT_UNAVAILABLE 경로로 전달된다.

기존 GAME_RESULT_CHECK {gameSessionId} → GAME_RESULT 계약을 유지한다.
PENDING의 myCoinDelta는 null, SETTLED는 본인 확정 순증감이다.
수신 커밋 뒤 version1/PENDING, 정산 커밋 뒤 version2/SETTLED의 GameResultCommitted를
회원별로 발행한다. Story 174에서는 내부 GameResultsReady를 같은 트랜잭션에서 V123 outbox에 저장한다.
별도 전달기가 커밋된 행만 읽으므로 롤백 시 알리지 않는다.
알림 I/O 실패는 이미 커밋된 DB 결과를 되돌리거나 추가 지급하지 않는다.
TableHub는 경기·게임·참가자 집합과 시작 시 고정한 B를 대조해 SETTLING→WAITING으로 전환한다.

## 마이그레이션·배포

Story 173은 V122__support_game_bets_and_explicit_leave.sql을 추가했다. V1~V121은 수정하지 않는다.
V112의 두 1코인 CHECK를 양수/전체 판돈 관계로 확장하고 EXPLICIT_LEAVE 누락을 보완한다.
기존 B=1 데이터와 원장은 그대로 유지한다. 새 테이블·Wallet 컬럼은 필요하지 않다.

기존 Flyway locations/기능 플래그는 변경하지 않았다. V122는 현재 로컬 최고 V121 다음 번호이며
병합 전 진행 중인 다른 MR과 버전 예약을 확인해야 한다. 공용 DB 적용·repair·outOfOrder는 실행하지 않는다.
특히 선택한 locations에 낮은 미적용 버전이 있으면 배포 전 별도 승인된 경로를 확인해야 한다.
Story 174는 팀 예약 확인 후 V123 outbox/이탈 수신 metadata를 추가한다. 기존 V112/V122는 수정하지 않는다.

## Story 174 이후에도 남은 제한

- 다른 boot의 RESERVED/RUNNING 자동 무효화·반환은 실행 소유권 확인 전 구현·활성화하지 않는다.
- 이탈 영속화, 무효 반환, 프로세스 내 ACK/재전달, 확정 PENDING 재시도와 outbox는 구현했다.
- 최초 DB 커밋 전 프로세스 자체가 종료되면 미ACK 메모리 이벤트는 유실될 수 있다.
  결과 조회와 알림 재전달은 지급을 반복하지 않는다.
- 종결 시작 결과의 RESERVED 재구성 차단과 현재 boot의 활성화 확인은 Story 174에서 보완했다.
  분산 소유권 보호와 자동 엔진 유실 반환은 아직 연결하지 않았다. 진행 상태는 [복구 구현 상태](game-recovery.md)를 따른다.
- 플래그 기본값을 유지한다. 이 기능만으로 장애 복구까지 준비된 운영 게임이라고 판단하지 않는다.

## 검증

관련 단위·HTTP/RawWS·격리 MySQL만 선택 실행한다. 전체 회귀는 Epic MR 전 별도로 수행한다.
MySQL은 승인된 로컬 테스트 컨테이너의 새 ontop_game_test_story173_20261026_01만 사용한다.
기존 DB 초기화/기존 history 변경 없이 V112의 합성 1코인 예약을 만들고 V122 편입 및 checksum,
기존 데이터 보존·JPA validate·재실행0을 검증한다. 합성 회원/지갑/경기/원장은 검증 후 보존한다.

### 2026-10-26 실행 결과

| 범위 | 항목별 최종 통과 | 실패 | 건너뜀 |
|---|---:|---:|---:|
| Table/게임 시작·정산 단위 및 HTTP/RawWS, Wallet 조회·Shop 서비스 회귀 | 578 | 0 | 0 |
| OpenAPI local/dev/default/production 및 문서 계약 | 21 | 0 | 0 |
| MySQL: V112→V122 데이터 보존·예약·정산 | 50 | 0 | 0 |
| FE 관련 Vitest (6개 파일) | 53 | 0 | 0 |
| Playwright 로비/오목 연결 흐름 | 2 | 0 | 0 |

578개 관련 회귀 실행에서 기존 테스트 클라이언트 계약 불일치 6건을 발견했다.
현재 상태를 확인한 참가비 동의 필드를 전송하도록 보완해 관련 24건을 재실행했고,
추가로 드러난 관전 테스트의 비동기 상태 수신 경합 1건도 보완해 관련 15건이 통과했다.
표는 최초 실패를 감춘 단일 실행 결과가 아니라 각 테스트의 마지막 결과다. 운영 검증을 완화하지 않았다.
그 이전 569개 실행의 응답 필드/기존 오류 우선순위 기대값 불일치 2건도 수정·재검증했으며 위 578개 범위에 포함된다.
신규 원문 READY_SET 테스트 7건은 자동 필드 보완 없이 누락/위조/ABA/경합을 검증한다.

MySQL 8.4.11, 127.0.0.1:49701의 승인된 신규 DB를 사용했다.
GameStartMySqlTests 30건(기존 25+신규 5), GameSettlementMySqlTests 19건,
GameBetMigrationMySqlTests 1건이 모두 통과했다. 적용 버전은 V1~V6/V100/V110/V111/V112/V122다.
합성 회원 122명, 경기 55개, 참가 기록 99개, 원장 148개를 보존했다.
검증용 트리거는 0개이며 기존 테스트 DB 898개 테이블 체크섬 차이는 0건이다.
ontop_dev/공용 DEV DB, 컨테이너·볼륨, 기존 SQL과 Flyway history는 변경하지 않았다.

FE 타입 검사 두 종류도 통과했다. Playwright는 브라우저와 HTTP/WS Mock을 사용하며
실제 OAuth 또는 MySQL과 결합한 전체 UI 테스트로 간주하지 않는다.
백엔드 CommittedStartFlowTests의 HTTP/JWT/RawWS/엔진 연결과 MySQL 경계를 나누어 검증했다.
exportOpenApi로 정적 YAML을 갱신했고 TableSummary의 참가비 필드만 추가됐다.

주요 실행 명령(backend / frontend 각각의 디렉터리):

```powershell
.\gradlew.bat test --tests 'com.ssafy.ontop.table.*Tests' --tests 'com.ssafy.ontop.game.start.*Tests' --tests 'com.ssafy.ontop.game.result.persistence.*Tests' --tests 'com.ssafy.ontop.wallet.service.*Tests' --tests 'com.ssafy.ontop.shop.ShopServiceBehaviorTests' --console=plain
.\gradlew.bat test --tests 'com.ssafy.ontop.api.*' --console=plain
.\gradlew.bat exportOpenApi --console=plain
# 승인한 DB의 TEST_GAME_DB_*를 별도 프로세스에 안전하게 주입한 후 실행
.\gradlew.bat mysqlTest --tests 'com.ssafy.ontop.game.start.GameStartMySqlTests' --tests 'com.ssafy.ontop.game.result.persistence.GameSettlementMySqlTests' --console=plain
# 아래 검증은 비어 있는 신규 격리 DB에서 한 번 실행했으며, 보존 중인 DB에서는 반복하지 않는다.
.\gradlew.bat mysqlTest --tests 'com.ssafy.ontop.game.result.persistence.GameBetMigrationMySqlTests' --console=plain
pnpm typecheck
pnpm typecheck:tests
pnpm exec vitest run tests/unit/tableLobby.test.ts tests/unit/tableLobbyRuntime.test.ts tests/unit/tableGathering.test.ts tests/unit/publicGameWatch.test.ts tests/unit/tableIdentity.test.ts tests/unit/movementRuntime.test.ts
pnpm exec playwright test tests/e2e/table-lobby.spec.ts --grep 'M09 lobby uses' --workers=1
pnpm exec playwright test tests/e2e/omok.spec.ts --grep 'settlement 1280' --workers=1
git diff --check
```

전체 clean build/flowTest/mysqlTest는 Epic MR 직전 별도 실행한다. 이번에 전체 통과를 주장하지 않는다.

### 커밋 전 실패 로그 보완 검증

리스너 6건 + 수신 서비스 6건 + 커밋 알림 1건, 총 13건 통과/실패 0/건너뜀 0.
수신 실패 시 정산 미호출, 두 단계의 커밋 예외 전파, 정산 실패 시 자동 재시도 없음,
구조화 필드/기본 콘솔 메시지, 예외 메시지·회원 식별자·전체 payload 로그 제외를 확인했다.
이 Story 173 검증 시점에는 AFTER_COMMIT 구조와 계산 공식을 변경하지 않았다.
이후 Story 174는 동일 계산을 유지하면서 완료 알림을 영속 outbox로 전환했다.
이번 보완에서는 MySQL/FE/전체 회귀를 다시 실행하지 않았다. 앞 절의 MySQL 결과는 이전 검증 이력이다.

```powershell
.\gradlew.bat test --tests 'com.ssafy.ontop.game.result.persistence.GameFinishedPersistenceListenerTests' --tests 'com.ssafy.ontop.game.result.persistence.GameFinishPersistenceServiceTests' --tests 'com.ssafy.ontop.game.result.persistence.GameResultNotificationsTests' --console=plain
git diff --check
```

읽기 전용 확인에서 backend/src의 migration 버전 중복은 0개, V122 파일은 한 개였다.
V112는 작업 트리/HEAD/캐시된 origin/dev의 Git 내용이 동일하다. 원격 갱신이나 DB 이력 변경은 하지 않았다.
다른 진행 중 MR의 V122 번호 예약은 이 로컬 조사만으로 확정할 수 없으므로 병합 전에 팀과 확인한다.
FE 변경 파일 24개의 내용은 보완 전후 SHA-256이 동일하다.

## Jira 반영 범위

- 172: selector의 가변 참가비 스냅샷, fingerprint/예약 결과 금액 일치, 인원별 금액 상한,
  전원 B 예약·원장·동시성/멱등성 유지, 기존 V112 불변/V122 CHECK 확장.
- 173: READY_SET 참가비·기존 version 동의, 정상 종료 수신/정산 분리, 공동 승리 보너스 원장,
  본인 결과 조회, AFTER_COMMIT 알림과 기존 다음 판 연결, FE 변경·관련 자동화 검증.
- 174: 앞 절의 무효 반환·이탈 독립 저장·복구·재활성화 방지·내구성 있는 재전달을 후속 진행.
