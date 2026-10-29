# 인증 사용자 경기 시작 연결

전원 준비 → 참가/판돈 예약 확정 요청 → 실제 엔진 생성 → 시작·복구 상태 전달을 연결한다. 현재 참가비는 GAME_SELECT에서 selector가 확정한 양수 금액이며, 2026-10-23 사용자 확정인 시작 시 예약·종료 시 차감/지급이다. **A 연결부 구현이며 실제 DB 예약·차감·원장·정산 구현/검증과 구분한다.**

## dev 실행 조건 정리 · 2026-10-25

기준 dev `7e42f48`을 반영한 로컬 버전에서 경기 코드의 dev 등록 범위를 정리했다. 현재 소스의 DB 구현 등록과
실제 송금 검증 범위는 아래와 같이 구분한다. 테스트 대역의 RESERVED/SETTLED를 DB 처리 완료로 쓰지 않는다.

| 경계 | 현재 코드와 연결 조건 |
| --- | --- |
| 시작 예약 | 실제 DB `GameStartGateway` 구현은 dev에 미등록. 같은 startAttemptId에 참가자·좌석·순서가 같은 결과를 반환하고, 전원 예약 커밋 후에만 RESERVED |
| 종료 저장·정산 | 공통 GameParticipantLeft/GameFinished의 eventId로 중복 반영 방지. 게임별 종료 이벤트와 공통 이벤트 양쪽에서 이중 정산하지 않음 |
| 결과 조회·알림 | 실제 DB `GameResultGateway` 구현은 dev에 미등록. 본인 종료 결과만 조회하며 조회로 정산하지 않음. 경기 전체 정산 커밋 후 본인별 GameResultCommitted, PENDING보다 증가한 version 필요 |
| 실행 프로필 | CommittedGameStartService·GameReconnectService·GameResultService·종료 연결 리스너 및 네 엔진은 local/dev 또는 운영 `prod,db`에서 등록 가능. 운영과 local/dev 혼합 프로필은 제외. 시작·엔진은 기본 false로 명시 활성화 필요 |

개발 서버를 local 혼합 프로필로 우회 실행하지 않는다. DB 구현·활성화가 반영된 버전에서
실제 지갑 balance/reserved_balance·원장·경기/참가자 기록의 원자성을 확인하고, PENDING 동안 SETTLING,
SETTLED 뒤 좌석 유지·준비 해제·다음 판 새 시도까지 검증한다. 이번 점검은 DB 예약/정산·배포를 실행하지 않았다.

변경 전 점검에서는 기존 시작/결과 계약·실제 WS 흐름 55개(CommittedStartFlowTests 15개 포함)를 재실행해
통과했다. 예약 확정 전 미시작·응답 유실 후 같은 시도 조회·금액 불일치·30초 복귀 경계,
실제 엔진 시간패 → PENDING → SETTLED → 다음 판·과거 알림 거절을 확인했다.
회원 조회·DB 예약/결과 저장은 기존 테스트 대역이다. 실제 DB 잔액·원장 원자성 통과로 확대하지 않는다.

## 켜는 조건

- `local` 또는 `dev`, 운영에서는 `prod,db` + `ontop.websocket.authenticated=true` + `ontop.game-start.enabled=true`. `prod`/`production`과 local/dev를 혼합하면 연결부를 등록하지 않는다. 운영 서버에서 local/dev를 추가하지 않는다.
- B의 실제 DB Gateway는 `JpaGameStartGateway`이며 `db`와 `ontop.game-start.enabled=true` 조건에서 등록된다. V112가 적용된 DB가 필요하다. 기본값은 false다. [경기 시작 영속화 계약](game-start-persistence.md)을 따른다. 종료 정산/자동 반환은 후속 Story이므로 실제 DB에서 임의 활성화하지 않는다.
- `ontop.start-rehearsal.enabled=true`와 동시 사용하거나 LocalGameStartGateway를 실제 시작에 사용할 수 없다.
- 사용할 게임 엔진을 별도로 활성화한다. 오목은 `ontop.games.omok.enabled=true`. 원카드/거짓말 다리는 해당 엔진을 활성화해야 한다. 원카드 기권 손패는 사용자 확정에 따라 REMOVE(이번 경기에서 제외)로 고정하며 별도 정책 설정은 필요하지 않다.
- 주사위는 `ontop.games.farkle.enabled=true`와 첫 착석자가 선택한 targetScore(2000/4000/6000)가 필요하다. GAME_SELECT → 테이블 스냅샷 → 고정 GameStartCommand → 같은 경기 ID의 FarkleEngine.create로 전달한다. 미선택 목표·미설정 엔진은 예약 요청 전에 거절한다.

실제 서버 설정이나 배포 옵션은 이번 작업에서 변경하지 않는다. 테스트 전용 ReservationDouble은 실제 지갑·잔액·DB 트랜잭션이 아니다.

dev에서 실제 경기 시작 기능을 사용하려면 `GAME_START_ENABLED`와 사용할 엔진의
`GAME_OMOK_ENABLED` / `GAME_FARKLE_ENABLED` /
`GAME_ONECARD_ENABLED` / `GAME_BRIDGE_ENABLED`를 각각 true로 설정해야 한다
(모두 기본 false).

`.env.example`은 키 목록이며 Spring이 파일을 자동으로 읽는 설정은 아니다.
실행 환경에 변수를 주입해야 한다.

실제 DB 예약 Gateway인 `JpaGameStartGateway`가 추가되었으며,
`db` 프로필과 `ontop.game-start.enabled=true` 조건에서 등록된다.
V112 마이그레이션이 적용된 DB가 필요하다.

종료 정산 및 예약 해제는 후속 Story에서 구현할 예정이므로,
공용 dev에서는 실제 DB 코인 예약 기능을 활성화하지 않는다.

정산 결과 저장 Gateway는 별도 연결해야 실제 저장 결과를 조회하고
SETTLING을 해제할 수 있다.

`DevCommittedStartFlowTests`는 local을 섞지 않은 dev의 실제 channel-1·조회된 tableId로
JWT/접속권 → 착석·준비 → 예약 확정 대기 → 엔진 착수 → heartbeat 단절·29초 복귀 → 시간패 →
PENDING → SETTLED → 준비 해제·다음 판을 검사한다. 회원 조회·예약·결과 저장은 테스트 대역이다.
`GameRuntimeProfileTests`는 dev 옵션·DB 예약 Gateway 누락 시 기동 실패·운영 `prod,db` 등록·운영 혼합 프로필 제외를 검사한다.

## 한 흐름

1. 로그인 JWT로 접속권을 발급하고 `/ws/tables?ticket=...`에 연결한다.
2. 채널이 설정돼 있다면 CHANNEL_JOIN 후 서버가 조회로 준 tableId에 TABLE_JOIN 한다.
3. 첫 착석자가 GAME_SELECT, 2명 이상 현재 참가자 모두 READY_SET(true). 카운트다운 없음.
4. 서버가 참가자/좌석/게임과 시작 시도 UUID를 한 번 고정하고 STARTING을 전송한다. 이때 퇴장·준비/게임 변경은 TABLE_BUSY다.
5. Hub 잠금 밖에서 CommittedGameStartService가 엔진/계정 ID를 확인한 뒤 B의 startGame을 한 번 호출한다. 클라이언트는 참가자·예약액·경기 ID를 지정하지 않는다.
6. B는 전원 참가 기록·참가비 B 예약·예약 이력을 원자적으로 커밋한 경우에만 RESERVED를 반환한다. 시작 시 balance는 즉시 차감하지 않고 예약분을 다른 구매·경기에 사용할 수 없게 한다. A는 동일 시도·참가자/좌석·reservedAmountPerPlayer=B·totalReservedAmount=B×참가자수·경기 ID를 검사한다.
7. 검사된 성공 뒤 해당 경기 ID로 엔진을 생성한다. 첫 좌석부터 엔진 참가자 순서로 전달하며 오목은 흑/백이다. 실제 경기 엔진의 create는 같은 경기/참가자에 멱등적이다.
8. GAME_START_STATE(PLAYING, simulation=false)를 같은 테이블 참가자에게 전송하고 기존 GAME_CONNECTION_STATE로 본인 최신 상태·조작권을 연결한다. 공개/개인 상태와 입력 메시지는 기존 계약을 사용한다.

## 실패와 재조회

확정 REJECTED는 준비를 초기화해 WAITING으로 돌린다. 계정별 잔액이나 저장소 예외를 브라우저에 전파하지 않고 START_REJECTED만 알린다.

PENDING/CONFLICT/예외/잘못된 성공 결과는 STARTING을 유지한다. GAME_START_CHECK의 payload는 `{}`이며 같은 startAttemptId로 `findStartResult`만 호출한다. 새 시도나 재예약을 요청하지 않는다. 엔진 생성이 실패해도 같은 확정 결과와 경기 ID로 다시 생성하며 예약을 다시 요청하지 않는다. A 메모리는 재시작 복구용 영속 저장소가 아니다.

## 기존 메시지의 실제 시작 모드

GAME_START_CHECK/GAME_START_STATE의 필드와 방향은 유지한다. 개발용 rehearsal은 계속 simulation=true/CONFIRMED를 사용하고 실제 시작 모드는 simulation=false/PLAYING을 사용한다. 기본 대기 모드는 추가 시작 메시지를 활성화하지 않는다.

```json
{
  "requestId": null,
  "type": "GAME_START_STATE",
  "payload": {
    "tableId": "table-example",
    "revision": 3,
    "phase": "PLAYING",
    "startAttemptId": "2b119ea2-fd96-4efe-9d46-56d848a1ebc3",
    "gameCode": "OMOK",
    "gameSessionId": "server-confirmed-game-id",
    "code": null,
    "simulation": false
  }
}
```

이 예제는 응답 형식이며 실제 DB에 저장된 경기/예약 증거가 아니다. GET 테이블 목록은 해당 테이블을 PLAYING/joinable=false로 표시한다. targetScore는 테이블 상태·HTTP 요약에 추가하며 주사위만 값이 있고 다른 게임은 null이다.

## 종료·정산·다음 판 · 2026-10-22 사용자 확정

실제 엔진 종료 → 좌석 유지·전원 준비 false → GAME_START_STATE.phase=SETTLING 및 HTTP status=SETTLING(joinable=false) → 경기 전체 SETTLED 확인 → WAITING → 다시 전원 준비 → 새 startAttemptId/확정 gameSessionId로 새 경기다. 카운트다운이나 자동 재시작은 없다. 정산 대기 중 게임 선택·준비·퇴장은 TABLE_BUSY로 보호한다.

SETTLED는 경기 전체 정산 트랜잭션의 커밋 상태이며 참가자별 알림 수신 완료 횟수가 아니다. 일치하는 확정 경기 ID·게임 코드·최초 참가자 집합·시작 시 확정 참가비 B와 본인 참가를 검사한다. PENDING·타 경기·잘못된 참가자 결과로 다음 판을 열지 않는다. GameResultCommitted 또는 GameResultGateway에서 검증해 읽은 GameResultLoaded로 확인하며, 이벤트 유실 시 기존 GAME_RESULT_CHECK로 재조회한다. 저장되지 않은 상태·읽기 실패에는 그대로 대기한다. DB 저장·지급은 이 연결부가 호출하지 않는다.

시작 성공을 Hub에 반영하기 전에 엔진이 종료될 수 있으므로 조기 종료/정산 알림을 해당 시도에 보존하고, 확정 경기 ID가 같은 경우만 재적용한다. 이전 경기의 늦은 알림은 새 경기를 해제하지 않는다. 정산 후 접속 중인 좌석·선택 게임·주사위 목표는 유지하고 준비는 해제한다. 끊긴 사용자의 예약 좌석은 대기 전환 시 기존 정책대로 정리하며, 새로 접속하면 종료 결과를 조회하고 다시 착석한다. 메모리 상태이므로 재시작/다중 서버 복구 보장은 별도다.

## 끊김과 검증 범위

시작 요청이 이미 전달됐다면 단절돼도 좌석과 같은 시도를 보존한다. 기존 연결이 살아 있으면 추가 연결은 거절하고, 끊긴 계정은 새 접속권으로 같은 시작 상태/경기에 돌아올 수 있다. 확정 대기 중 빈 경기 조회나 이전 종료 경기 조회로 원래 단절 시각·30초 유예를 지우지 않는다. 유예 안에 돌아온 시점도 보존한다. 경기 생성 후 30초 경과가 확인되면 기존 기권/탈락 경계로 연결하며 턴 시간은 계속 흐른다.

CommittedStartFlowTests는 실제 JWT/HTTP/RawWS/오목 엔진으로 확정 전 미시작·확정 후 착수·거절·응답 유실 재조회·금액 불일치·단절/29·30초 복귀를 검증한다. 계정 조회와 B 예약 경계는 대역이다. CommittedStartContractTests는 엔진 생성 실패 재시도·설정 혼용·미설정 엔진/비계정 ID를 검사한다. 실제 OAuth/DB/정산/프론트/운영 검증과 구분한다.

## 판돈 예약 경계 · 2026-10-23 사용자 확정

- 내부 성공 타입은 `GameStartResult.Outcome.RESERVED`, 팩터리는 `GameStartResult.reserved(command, gameSessionId)`다. 기존 SUCCEEDED/entryFeePerPlayer/totalPot는 RESERVED/reservedAmountPerPlayer/totalReservedAmount로 바꿨다. 프론트 JSON 필드는 추가·변경하지 않는다.
- `isReservationCommitted`를 통과한 결과만 실제 엔진 생성 및 PLAYING 전환에 사용한다. PENDING·예약액0·일부 참가자/금액 불일치는 게임 시작으로 취급하지 않는다.
- `findStartResult`는 같은 시도의 저장된 예약 결과 조회이며 신규 예약·차감·지급을 실행하지 않는다. 응답 유실·엔진 생성 실패도 같은 예약과 경기 ID를 재사용한다.
- 실제 잔액 검증·지갑 잠금·예약 저장·중복 방지·정산은 B 담당이다. A는 경기 종료 시 예약을 해제하거나 돈을 계산하지 않는다. B가 종료 정산에서 예약 해제·차감·승자 지급을 한 트랜잭션으로 확정한 뒤 기존 GameResultCommitted/조회로 SETTLED를 전달한다. PENDING 동안은 SETTLING을 유지한다.
- 추가 베팅·무승부/서버 장애 정산 정책은 이번 변경으로 확정하지 않는다. 참가비는 selector가 확정한 양수 B이며 현행 [정산 계약](game-settlement.md)을 따른다.
