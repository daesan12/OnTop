# GAME Story 174 구현 및 연동 상태

## 작업 기준

- 최초 구현 기준은 `c674f96`이며 Hotfix `965547f`가 포함되어 있다. 사용자 승인 후 구현을
  `5d5793a`로 보존하고 최신 원격 dev `0b0f275`를 `9dec79d`에서 현재 기능 브랜치에 병합했다.
  TableHub의 맵 선택 생성자와 Story 174 종결 복구 연결부는 충돌 없이 함께 보존됐다.
- 기존 V112/V122, 참가비 B, 공동 승리 보너스 공식, 경기 행 → userId 순 Wallet 잠금을 유지한다.
- 승인된 FE 결과 계약과 관련 테스트를 반영했다. DEV 설정, 공용 DB 및 기능 플래그는 변경하지 않는다.
- 아래의 미완료 항목은 구현 완료 또는 배포 가능 상태를 뜻하지 않는다.

## 현재 백엔드 변경

| 항목 | 상태 |
|---|---|
| FINISHED/INVALID 시작 결과를 다시 RESERVED로 반환하지 않음 | 구현 |
| 예약·활성화가 같은 instanceId/bootId 사용 | 구현 |
| DB 경기 활성화 전 소유자·요청 fingerprint 확인 | 구현 |
| 엔진 create 후 RUNNING/started_at 기록 | 구현 |
| GameParticipantLeft 독립 저장 | 구현 |
| ABORTED_NO_PLAYERS → INVALID/PENDING | 구현 |
| INVALID 예약 반환·GAME_RELEASE·SETTLED | 구현 |
| 판정 없는 INVALID의 result=null 조회/응답 | 구현 |
| FINISHED/PENDING·INVALID/PENDING 재시도 배치 | 구현 |
| 엔진 최초 이벤트 보존·ACK·비동기 재전달 | 현재 프로세스 내 재전달 구현 |
| 커밋 결과 outbox·재전달 | V123으로 구현 |
| DB 종결 스냅샷으로 PLAYING/SETTLING 고착 복구 | 현재 boot의 대기 라운드에 연결 |
| 다른 boot의 미완료 경기 자동 INVALID/반환 | 실행 소유권 확인 전 구현·활성화하지 않음 |
| FE의 INVALID nullable 결과 지원 | 승인 후 반영, 공통 2D/3D 표시·재조회 연결 |

### 활성화와 RUNNING

`GameRuntimeIdentity`는 현재 Spring 실행에서 공유하는 instanceId와 boot UUID를 제공한다.
GAME_INSTANCE_ID의 기존 기본값 single-instance는 유지한다. 이 기본값은 단일 실행 보장이 아니다.

`GameActivationPersistenceService.authorize`는 경기 행 잠금 아래 요청 fingerprint와 저장된
instanceId/bootId, 미종결 상태를 확인한다. 다른 boot의 예약을 가져오거나 반환하지 않는다.

엔진 create가 반환한 다음 별도 트랜잭션의 started가 RUNNING/started_at을 기록한다.
엔진 create의 tick/종료 콜백이 별도 DB 트랜잭션을 사용할 수 있으므로, create 중에는 경기 행 잠금을
보유하지 않는다. 시작 확인이 지연되어도 FINISHED/INVALID를 RUNNING으로 되돌리지 않는다.
시작 확인 커밋이 실패하면 성공으로 확정하지 않는다. 현재 boot의 동일 경기 create는 기존 엔진의
멱등성을 사용해 재확인할 수 있다. 다른 boot의 경기는 이 흐름으로 재활성화하지 않는다.

이 사전 검증·사후 확인은 분산 lease/fencing이 아니다. 향후 자동 무효화와 엔진 활성화 사이의 경합은
실행 소유권 보호 및 활성화 승인/취소 계약과 함께 검증해야 한다.

### 이탈·종료 순서

- GameParticipantLeft의 canonical eventId는 gameId:left:userId다.
- 경기·테이블·게임·최초 참가자·시각을 확인하고 경기 행 잠금으로 최종 판정과 직렬화한다.
- V123의 departure_event_version/payload_hash로 동일 이벤트를 판별한다. 버전만 다른 중복도 거절한다.
- LEFT만으로 result를 FORFEIT로 만들거나 예약을 해제하지 않는다.
- 최종 판정이 먼저 저장되면 일치하는 이탈만 인정하며 최종 결과를 덮어쓰지 않는다.
- 최종 판정이 이탈보다 먼저 저장되어도 일치하는 이탈의 수신 metadata를 뒤늦게 기록할 수 있다.

### INVALID 결과와 반환

ABORTED_NO_PLAYERS는 현재 Bridge 엔진의 전원 이탈 판정으로 수신한다.
엔진이 제공한 FORFEIT 결과와 이탈 정보는 보존하며 잔액을 차감하지 않는다.

엔진 판정 없이 만들어진 INVALID 결과는 참가자의 result를 null로 유지한다.
현재 자동 엔진 유실 판정 경로는 연결하지 않았다. null을 WIN/LOSE/DRAW/FORFEIT로 채우지 않는다.
정상 FINISHED 결과는 참가자 전원의 result가 필수다.

반환은 경기 행 잠금 → userId 순 Wallet 잠금으로 진행한다. 각 참가자에 대해:

- balance는 유지하고 reserved_balance에서 시작 시 확정 B를 해제한다.
- GAME_RELEASE(balance_delta=0, reserved_delta=-B)를 기록한다.
- 기존 game:id:close:userId 멱등 키를 사용한다.
- coin_delta=0, reservation_released_at을 기록한다.

경기 전체 INVALID/SETTLED, settled_at, 증가한 result_version을 같은 트랜잭션에서 저장한다.
SETTLED 재호출은 추가 원장/반환을 만들지 않는다. 정상 종료의 기존 공동 승리 계산은 변경하지 않는다.

## 확정된 종결 경기 재시도

`GameTerminalRetryService.retryPending(afterId, limit)`는 FINISHED/PENDING과 INVALID/PENDING만
조회한다. RESERVED/RUNNING의 엔진 유실을 추정하지 않는다.

- 각 경기의 settle 호출은 기존 별도 REQUIRES_NEW 프록시를 사용한다.
- 한 경기 실패가 다른 경기 처리를 막지 않는다. 실패 행도 cursor를 진행하고 다음 순회에서 재처리한다.
- 조회와 결과 재시도는 count 쿼리를 사용하지 않는다.
- 자동 worker는 db 프로필과 game-start.enabled=true를 요구한다. 기존 게임 시작 옵션은 켜지 않았다.
- 확정 종결 재시도는 5초마다 실행한다. retry-enabled는 기본 true이며 false로 별도 중지할 수 있다.
- background-enabled=false는 격리 테스트에서 자동 실행 대신 같은 수신·정산·전달 메서드를 수동 실행하기 위한
  설정이다. 인증·트랜잭션·멱등성 검증을 우회하지 않는다. 기본 true이며 운영 설정을 변경하지 않았다.

## 실행 소유권 확인 결과와 복구 보류

사용자 제공 Jenkins 로그: ontop-dev-app-app-1의 Recreate → Recreated → Starting → Started,
이후 health check 성공. 저장소 DEV Compose에는 app 서비스가 하나 정의되어 있다.

아직 확인되지 않은 항목:

1. 실제 DEV 백엔드 동시 실행 수와 다른 실행 인스턴스 존재 여부
2. 실제 GAME_INSTANCE_ID 설정 유무 및 값의 고유성·안정성
3. 구 컨테이너 완전 종료 시점과 새 컨테이너 시작의 중첩 여부

따라서 다른 boot ID, DB 연결 장애, 엔진 조회 실패를 죽은 실행 주체의 증거로 사용하지 않는다.
이 정보를 근거로 RESERVED/RUNNING을 자동 INVALID 처리하는 코드나 timer는 구현하지 않는다.

안전한 복구 활성화 전 필요한 최소 계약 후보:

- 인스턴스 ID와 boot/epoch를 공유하고, 실행 소유권을 입증하는 DB lease/fencing 또는
  검증된 단일 실행·이전 실행 종료 증거를 확보한다.
- 활성화 승인과 무효화는 같은 경기의 상태 전이와 직렬화한다.
- 신규 경기 활성화 전에 해당 실행 주체의 복구 완료를 확인한다.
- 다른 실행 주체의 살아 있는 경기에는 무효화·반환을 수행하지 않는다.
- DB에 FINISHED가 저장된 경기는 엔진 부재와 무관하게 정상 정산을 재시도한다.

## 이벤트 전달·outbox 구현

1. GameEventDelivery의 가장 우선순위가 높은 Spring 리스너는 불변 이벤트를 메모리에 보관하고 즉시 반환한다.
   전용 worker가 DB를 호출한다. DB 수신 커밋 후 CompletionStage ACK를 완료하며 정산 실패와 구분한다.
2. 단순 비동기 executor에 넣은 것만으로 수신 성공을 확정하지 않는다.
3. 엔진→DB 최초 전달 전에 프로세스가 종료되면 DB outbox만으로 판정을 복원할 수 없다.
   이 경우의 INVALID 반환은 위 실행 소유권 확인을 선행해야 한다.
4. 판정/정산/반환과 결과 outbox를 같은 DB 트랜잭션으로 저장한다.
5. 단일 결과 알림 유형만 저장하므로 outbox는 (game_session_id, result_version) UNIQUE와 원본 스냅샷을 사용한다.
6. dispatcher 실패·종료 후 재전달은 허용하되 원래 정산·반환을 다시 실행하지 않는다.
7. 공개 GameResultView.userId는 @JsonIgnore다. outbox envelope에 recipientUserId를 별도로 보존한다.
8. Spring 이벤트/전송 큐의 수락과 WebSocket 클라이언트 수신 ACK는 구분한다.
   외부 broker나 클라이언트 ACK는 추가하지 않았다. 기존 GAME_RESULT_CHECK 조회 복구를 유지한다.
9. 영속 수신 재시도를 GameFinished 전역 재방송으로 구현해 행동 로그를 중복 생성하지 않는다.

수신 실패는 동일 이벤트로 0.5~30초 간격 재시도한다. 잘못된 계약/상충 판정은 예외 ACK로 구분하며 성공으로
처리하지 않는다. 대기 이벤트를 TTL로 삭제하지 않는다. 이탈은 참가자당 하나, 종료는 경기당 하나로 중복을
억제하며 예약 미완료 경기는 기존 활성 경기 제약 때문에 계속 새로 예약할 수 없다.
ACK 이후 정산 실패는 DB의 FINISHED/PENDING·INVALID/PENDING 재시도로 넘긴다.

outbox는 판정 수신(PENDING), 정산/반환(SETTLED) 트랜잭션 안에 각각 저장한다. 저장 실패는 해당 트랜잭션을
롤백한다. delivered_at은 별도 전달 성공 후 기록한다. 30초 DB 조건부 lease를 사용하며 프로세스 종료 또는 ACK
커밋 불명확 시 lease 만료 후 재전달한다. 재전달은 지급/반환을 다시 실행하지 않는다.
GameResultService는 전송 인계 성공 뒤에만 version을 기억하여 실패한 연결의 재전달이 차단되지 않게 한다.

TableHub의 종결 통지와 SETTLED 확인 조건은 유지한다. outbox 전달기는 DB 스냅샷으로 StoredGameRoundEnded를
발행하고 GameResultCommitted를 전달한다. 두 알림의 순서가 바뀌거나 중복되어도 기존 상태 전이를 재사용한다.

추가로 GameTableRecovery가 5초마다 현재 Hub의 PLAYING/SETTLING 라운드 스냅샷을 가져온 뒤 Hub 잠금 밖에서
GameStoredRoundQuery를 통해 DB를 읽는다. **현재 instanceId/bootId의 같은 경기**에 저장된 결과만 재반영한다.
전달 완료 여부나 outbox 존재 여부와 관계없이 같은 DB 스냅샷의 종결·참가 결과를 읽으므로,
V123 도입 전 종결된 경기 및 다른 전달기가 알림을 소비했거나 로컬 종료 통지가 유실된 경우도 보완한다.
과거 경기 전체를 반복 방송하거나 다른 boot를 무효화하지 않는다. DB 장애는 종결/환불 사유가 아니다.

제한: 프로세스가 최초 DB 수신 커밋 전에 종료되면 미ACK 메모리 이벤트는 유실될 수 있다.
이를 DB outbox로 복구했다고 주장하지 않는다. 해당 RESERVED/RUNNING의 처리에는 여전히 실행 소유권 확인이 필요하다.
또한 다중 인스턴스 간 WebSocket 메시지 fan-out은 추가하지 않았다. 연결이 다른 노드에 분산되는 배포에서는
별도 공유 메시지 전달 계약이 필요하며, 현재 로컬 Hub 복구와 명시적 결과 조회를 유지한다.

## FE 결과 계약 반영

기존 GAME_RESULT_CHECK → GAME_RESULT 메시지 타입과 요청 필드는 유지한다.
GAME_SELECT/READY_SET 참가비·동의 version 계약은 변경하지 않는다.

| 파일 | 반영 내용 |
|---|---|
| frontend/src/game/protocol.ts | participants[].result를 INVALID에서만 nullable로 검증. null을 문자열로 변환하지 않음 |
| frontend/src/park/runtime/SpringParkRuntime.ts | 서버에서 확인한 현재·완료 경기 ID로 조회. 엔진 객체 불필요, 관전자·다른 테이블 거절 |
| frontend/src/features/tableLobby/gathering.ts | 해당 경기의 저장 결과를 엔진 PLAYING 상태보다 우선 표시하고 카메라 조건과 연결 |
| frontend/src/features/tableLobby/gatheringModel.ts | 판정 없는 무효 상태와 예약 반환 표시. 승패/무승부를 추정하지 않음 |
| frontend/src/features/tableLobby/TableLobby.tsx | 같은 nullable/반환 문구와 WAITING+SETTLED 결과 닫기 조건 |
| frontend/tests/unit/gameFlow.test.ts | INVALID/PENDING 및 SETTLED nullable 응답 검증 |
| frontend/tests/unit/tableGathering.test.ts | 무효·반환 표시와 다음 판 조건 검증 |
| frontend/tests/e2e/contractFixture.ts | INVALID/null·지연/중복 알림·확정 참가비를 사용하는 합성 서버 결과 |

BE 계약: INVALID/PENDING의 myCoinDelta=null, INVALID/SETTLED의 myCoinDelta=0.
엔진 판정 없는 참가자 result=null. FINISHED에서는 null 금지.
FE는 해당 계약을 수용한다. 반환 표시는 결과의 확정 B를 사용하며 잔액에 B를 새로 더하지 않는다.
이미 확인한 경기의 재조회만 지원한다. 재접속·새로고침으로 ID를 잃은 과거 경기 자동 발견과
WalletBalance 자동 갱신은 이번 범위에 포함하지 않는다.

## Migration·검증

- 원격 dev 0b0f275의 최고 SQL 버전은 V122다. 사용자가 팀 예약 없음/V123 사용 가능을 확인했다.
- V123__add_game_result_outbox_and_departure_receipts.sql을 추가했다. V112/V122 및 다른 기존 SQL은 수정하지 않았다.
- V123은 game_result_outbox와 game_participants의 이탈 수신 version/hash 및 CHECK를 추가한다.
- 단위/관련 HTTP·WS 테스트를 선택 실행한다. MySQL은 별도 승인한 신규 격리 DB에서만 검증한다.
- 공용 DEV DB, ontop_dev, 기존 테스트 DB와 Docker 볼륨은 수정하지 않는다.

### 2026-10-26 선택 회귀 및 격리 MySQL 검증

검증 대상은 현재 작업 트리다. 전체 clean build/flowTest/mysqlTest 회귀는 실행하지 않았다.

| 실행 범위 | 통과 | 실패 | 건너뜀 |
|---|---:|---:|---:|
| game.start.*, game.result.persistence.* 단위 및 관련 실제 HTTP/WebSocket 테스트 | 136 | 0 | 0 |
| GameSettlementMySqlTests 기존·Story 174 추가 시나리오 | 25 | 0 | 0 |
| GameStartMySqlTests 예약·Shop·탈퇴 경합 회귀 | 30 | 0 | 0 |
| 종결 재시도 쿼리 및 이탈 저장 롤백 추가 MySQL 테스트 | 2 | 0 | 0 |
| 합계(중복 실행 제외) | 193 | 0 | 0 |

관련 HTTP/WebSocket 선택 실행 클래스는 GameRuntimeProfileTests, CommittedStartContractTests,
CommittedStartFlowTests, DevCommittedStartFlowTests, GameResultTests, GameResultWebSocketTests,
GameDepartureFlowTests, WorldMapRecoveryTests를 포함한다. GameResultViewTests도 함께 실행했다.
최종 MySQL 추가 2건은 같은 클래스의 새 메서드만 선택 실행했다.

MySQL 실행 명령(backend, TEST_GAME_DB_*는 실행 프로세스에만 주입):

```powershell
.\gradlew.bat --no-daemon mysqlTest --tests 'com.ssafy.ontop.game.result.persistence.GameSettlementMySqlTests' --console=plain
.\gradlew.bat --no-daemon mysqlTest --tests 'com.ssafy.ontop.game.start.GameStartMySqlTests' --console=plain
.\gradlew.bat --no-daemon mysqlTest `
  --tests 'com.ssafy.ontop.game.result.persistence.GameSettlementMySqlTests.종결재시도는_PENDING만_정산반환하고_RESERVED는_유지한다' `
  --tests 'com.ssafy.ontop.game.result.persistence.GameSettlementMySqlTests.이탈기록_DB실패는_상태와예약을_유지하고_동일이벤트를_재시도한다' --console=plain
```

- 사용자 승인에 따라 기존 테스트 컨테이너의 **새** ontop_game_test_story174_20261026_01만 생성했다.
- MySQL 8.4.11, 127.0.0.1:49701. 비밀번호는 출력·문서화하지 않고 프로세스 환경변수로만 전달했다.
- 적용 migration: V1~V6, V100, V110, V111, V112, V122 총 11개. 기존 테스트의 3개 locations를 사용했다.
  V120/V121은 이 검증의 범위가 아니다. Flyway 통합 정비 stash는 적용하지 않았다.
- Flyway validate, JPA validate 및 migrate 재실행 시 추가 0개를 확인했다.
- 합성 회원·지갑·예약·경기·원장·Shop/Minigame fixture를 이 DB에만 기록했다. 검증 후 DB는 보존했다.
- 정상 종료와 ABORTED_NO_PLAYERS가 경합하면 하나의 판정만 커밋된다. 반환과 승자 지급이 혼합되지 않는다.
- GAME_RELEASE 저장 실패 시 반환 전체가 롤백되고 INVALID/PENDING을 유지한 뒤 재시도에 성공했다.
- 이탈 저장 실패 시 LEFT·시각·사유는 롤백되고 예약은 유지된다. 동일 이벤트를 재시도할 수 있다.
- 종결 재시도는 FINISHED/PENDING과 INVALID/PENDING만 처리하고 RESERVED를 그대로 유지했다.
- 사후 읽기 전용 검사: 임시 트리거 0개, 잘못된 Wallet 잔액 0개,
  Wallet 예약액과 미해제 참가 예약 합계 불일치 0개,
  정산 참가자 coin_delta와 원장 합계 불일치 0개, 경기 원장 합계와 서버 bonus 불일치 0개.
- 일부 합성 RESERVED/PENDING·FINISHED/PENDING은 실패 및 미완료 상태 검증 fixture로 남는다.
  이 기록을 실제 서비스 경기 또는 자동 소유권 복구 결과로 해석하지 않는다.
- git diff --check 통과. 기존 V112/V122, FE 소스, 운영 설정 변경 없음.

위 193건은 앞 단계 검증 결과다. 후속 ACK/outbox 변경의 검증 결과는 아래 별도 기록한다.
실행 소유권 확인과 승인 전 FE nullable 처리는 계속 인수 조건으로 유지한다.

### 후속 ACK·outbox 최종 검증

| 최종 선택 실행 | 통과 | 실패 | 건너뜀 |
|---|---:|---:|---:|
| 관련 단위·실제 HTTP/WebSocket 회귀 | 150 | 0 | 0 |
| GameStartMySqlTests | 30 | 0 | 0 |
| GameSettlementMySqlTests | 27 | 0 | 0 |
| GameDeliveryMySqlTests | 11 | 0 | 0 |
| 합계(최종 실행만, 이전 193건과 중복 합산하지 않음) | 218 | 0 | 0 |

MySQL 최종 명령:

```powershell
.\gradlew.bat --no-daemon mysqlTest `
  --tests 'com.ssafy.ontop.game.start.GameStartMySqlTests' `
  --tests 'com.ssafy.ontop.game.result.persistence.GameSettlementMySqlTests' `
  --tests 'com.ssafy.ontop.game.result.persistence.GameDeliveryMySqlTests' --console=plain
git diff --check
```

단위·HTTP/WS는 앞 단계의 선택 클래스에 새 GameEventDeliveryTests, GameTableRecoveryTests 및
실제 소켓의 FINISHED/INVALID 종료 통지 유실 복구 2건, 전송 실패 후 동일 version 재전달 테스트를 포함한다.

확인한 내용:

- 최초 DB 수신 실패 시 ACK 미완료/메모리 보존, 같은 불변 이벤트 재전달 후 1회 정산.
- 수신 순서 역전, 버전이 다른 이탈 중복, 상충 최종 판정 거절.
- 실제 비동기 worker의 DB 수신/커밋 ACK와 정산.
- outbox 저장 실패 시 정산·지갑·원장 롤백, 판정/PENDING 보존 후 재시도.
- 알림 실패 및 새 Spring 전달기 컨텍스트의 재전달, 같은 outbox 동시 선점 1개 성공.
- 전달기 종료로 남은 lease의 재선점과 오래된 소유권 ACK 거절.
- 별도 Java 21 JVM의 새 JDBC 연결/트랜잭션 전달기에서 DB outbox를 읽어 전달하고 재화/원장 불변 확인.
  전체 Docker/HTTP 서버를 재시작한 테스트는 아니며, 엔진 유실 복구를 검증했다고 해석하지 않는다.
- 실제 HTTP/WebSocket에서 종료 통지 유실·정산 통지 선행·중복 알림 후 WAITING 복구.
- 현재 boot의 같은 경기만 재대조하고 다른 boot의 결과로 로컬 라운드를 해제하지 않음.
- 해당 합성 경기의 outbox 2행만 제거하여 V123 도입 전 종결 행을 재현한 뒤 DB 읽기 복구 확인.
  회원·지갑·원장은 삭제하지 않았다.
- 같은 승인 DB의 V122→V123 업그레이드, Flyway/JPA validate 및 재실행 추가 migration 0개 확인.
  최종 적용 버전은 V1~V6, V100, V110, V111, V112, V122, V123 총 12개다.
- 최종 사후 검사: 트리거 잔여, 잔액 위반, 예약액/참가 기여 불일치, 정산액/원장 불일치,
  서버 보너스/경기 원장 합계 불일치 모두 0건. 같은 DB를 보존한다.

중간 테스트 실패는 숨기지 않는다. 신규 fixture의 User getter 오기, 새 전달기 컨텍스트가 공유 Hikari 풀을
닫던 수명 관리, @Repository의 Spring 예외 변환 기대값, 별도 JVM classpath 추출을 수정했다.
classpath는 mysqlTest의 테스트 전용 system property로 명시하고 자식 JVM의 임시 argfile에 전달한다.
비밀번호는 환경변수로만 전달하며 임시 argfile/log는 finally에서 제거한다. 운영 테스트 우회는 추가하지 않았다.
최종 218건에서는 실패·건너뜀이 없으며 전체 clean build/flowTest/mysqlTest는 실행하지 않았다.

인수 전 남은 사항(후속 FE 반영 및 dev 통합으로 1·2는 완료):

1. FE의 INVALID nullable result 처리는 승인 후 반영했다.
2. 원격 dev 0b0f275 통합은 완료했다. 전체 회귀 결과는 아래 최신 기록을 따른다.
3. 실행 소유권·배포 중첩 확인 및 별도 lease/fencing 계약 전에는 다른 boot의 RESERVED/RUNNING 자동 반환 금지.
4. 최초 DB ACK 전 프로세스 종료의 메모리 이벤트 유실, 다중 노드 메시지 전달 및 outbox 보관 기간은 별도 운영 계약.
5. 실제 DEV의 Flyway history/locations 및 낮은 누락 버전은 별도 승인된 절차로 확인한다.
   이번 V123 검증은 Flyway 통합 정비 stash나 기존 공용 DB의 누락 버전 문제를 해결하지 않는다.

## 2026-10-26 최신 dev 통합 회귀

- 로컬 보존: `5d5793a`(Story 174 BE/FE/V123/문서 64개 파일).
- 기능 브랜치에 dev 통합: `9dec79d`. 원격 dev는 `0b0f275`이며 V123 중복과 V112/V122 변경은 없다.
- 최초 전체 test: 1,729건 중 1건 실패, 15건 조건부 미실행. GameReconnectTests가 Clock을 만료시킨
  다음 오류를 주입해 실제 타이머가 정상 만료를 먼저 수행할 수 있었다. 오류 주입을 Clock 진행 전으로
  옮겼으며 운영 타이머·재접속 정책은 변경하지 않았다. 관련 클래스 15건 재검증 통과.
- 수정 후 `build flowTest`: BUILD SUCCESSFUL. test 1,714 통과 / 실패 0 / 조건부 미실행 15,
  flowTest 48 통과 / 실패 0 / 미실행 0. flowTest는 test와 중복되는 시나리오를 별도 실행한다.
- 미실행 15건은 기존 TEST_GENERATED_MAP_DIR 실물 생성맵 인수 14건 및
  TEST_WORLD_SOCIAL_FRONTEND opt-in 1건이다. 이번에 조건을 추가하거나 테스트를 비활성화하지 않았다.
- 승인 DB `ontop_game_test_story174_20261026_01`, MySQL 8.4.11에서 새 결과 XML을 확인했다.
  GameStartMySqlTests 30, GameSettlementMySqlTests 27, GameDeliveryMySqlTests 11건 모두 통과.
  Flyway 12개 validate, 재실행 신규 적용 0개, JPA validate와 Wallet/원장 정합성 위반 0건을 확인했다.
- FE 운영·테스트 타입 검사, Vitest 553건(실패/미실행 0) 및 프로덕션 빌드 통과.
  빌드에는 기존 500 kB 초과 chunk 경고가 남는다.
- E2E 사전 진단에서 누락된 참가비 입력, 전원 공동 WIN/본인 패배 결과와 다른 원장 fixture,
  실제 카트 표지판 수와 다른 기대값을 확인해 테스트만 수정했다. 원인별 E2E 6건은 통과했다.
- 이후 기본 Playwright 전체 206건을 끝까지 실행해 196 통과 / 2 실패 / 기존 미실행 8을 확인했다.
  Story 174의 FINISHED/INVALID, nullable result, 가변 B, 재조회/중복/역순, 2D/3D 결과 시나리오는 통과했다.
  실패는 카메라 테스트의 화면 마운트 전 hidden 판정과 감정표현 테스트의 1.8초 쿨다운 관측 경합이다.
  화면 마운트를 먼저 확인하고, 감정표현은 테스트 브라우저의 Date만 서버 이벤트 시각에 고정해
  양쪽 렌더/쿨다운을 같은 시점에서 검사한다. 실제 렌더·타이머는 계속 진행하며 운영 시간 정책은 그대로다.
- E2E 기존 미실행 8건은 자산 측정 opt-in 2건과 기존 보류 Shop UI 6건이다.
  이번 작업에서 skip을 추가하거나 timeout/검증을 완화하지 않았다.
- 실패 관련 파일 재검증: ad-camera.spec.ts 8건 통과, emote-bindings.spec.ts 최종 3건 통과
  (실패/미실행 0). 쿨다운 검사 순서만 옮긴 중간 실행은 1건이 계속 실패했고,
  로드 후 clock 적용도 timeout이 있어 최종적으로 앱 로드 전에 설정했다.
  전체 실행에서 통과한 196건과 수정 후 해당 2건의 재검증을 합치면 최종 시나리오 상태는
  198건 통과 / 기존 미실행 8건이다. 수정 후 전체 206건을 한 번 더 실행한 결과로 표현하지 않는다.

FE 실행 명령(설치된 로컬 CLI 사용):

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\tsc.cmd --project tsconfig.tests.json --noEmit
.\node_modules\.bin\vitest.cmd run --reporter=json --outputFile=node_modules/.cache/story174-after-dev-vitest-final.json
pnpm build
.\node_modules\.bin\playwright.cmd test --workers=1 --reporter=line,json
.\node_modules\.bin\playwright.cmd test tests/e2e/ad-camera.spec.ts tests/e2e/emote-bindings.spec.ts --workers=1 --reporter=line,json
.\node_modules\.bin\playwright.cmd test tests/e2e/emote-bindings.spec.ts --workers=1 --reporter=line,json
```

전체 E2E JSON은 `frontend/node_modules/.cache/story174-after-dev-e2e-final.json`,
카메라 포함 11건 재실행은 `story174-after-dev-e2e-timing.json`,
감정표현 최종 3건은 `story174-after-dev-e2e-emote-final.json`에 보존했다.
마지막 재실행 전에 운영/테스트 타입 검사, Vitest 전체 및 production build도 다시 통과했다.
