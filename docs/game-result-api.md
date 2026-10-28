# 경기 종료·정산 결과 전송 연결부

현재 구현은 Story 172·173·174를 포함한다. local/dev 인증 연결에서 등록되며(prod/production 혼합 제외),
db 프로필과 game-start 활성 조건에서 실제 결과 저장·정산·INVALID 반환 Gateway를 연결한다.
아래 두 WS 메시지의 JSON 형식은 유지한다. 기능 등록 조건과 실제 배포 활성화는 구분하며,
다른 boot의 미완료 경기를 자동 INVALID/반환하는 복구는 구현·활성화하지 않았다.
금액 정책은 [가변 참가비·정산](game-settlement.md), 전달·복구 범위는 [Story 174](game-recovery.md)를 따른다.

## 공통 경기 종료·이탈 이벤트 · 2026-10-23

아래는 서버 내부 Spring 이벤트이며 새 WebSocket 메시지가 아니다. `GAME_RESULT_CHECK` / `GAME_RESULT`의 기존 JSON 필드는 유지한다. 게임별 기존 종료 이벤트도 호환 목적으로 유지하며, DB 소비자는 공통 이벤트 또는 게임별 이벤트 중 한 경로만 구독한다.

| 이벤트 | 필드 / 의미 |
| --- | --- |
| `GameParticipantLeft` | eventId, gameId, tableId, gameCode, version, userId, leaveReason, leftAt. 경기 참가 자격 상실 시 한 번 발행. 3~4인 경기 중도 이탈에도 경기 전체 종료를 기다리지 않음 |
| `GameFinished` | eventId, gameId, tableId, gameCode, version, participants, endReason, endedAt. 최초 참가자 전체의 최종 판정 |
| `GameFinished.Participant` | 내부 long userId, result(WIN/LOSE/DRAW/FORFEIT), nullable leaveReason/leftAt. 먼저 이탈한 참가자도 최종 결과에 포함 |

`gameCode`는 OMOK/DICE/ONE_CARD/LIAR_BRIDGE. `leaveReason`은 LOGOUT/MEMBER_DEACTIVATED/DISCONNECT_TIMEOUT/EXPLICIT_LEAVE이며, 일반 패배나 턴 시간패는 이탈 사유가 없고 LOSE다. 이탈자는 FORFEIT, 그 외 엔진의 승자 목록은 WIN, 나머지는 LOSE, 승자 없는 무승부는 DRAW다. 말 제거가 보류된 다리 기권도 입력 자격 상실 시 이탈 이벤트를 내보낸다. 이 이벤트는 말 제거 완료를 뜻하지 않는다.

중복 종료/이탈 요청은 추가 판정을 만들지 않는다. 소비자는 `gameId:finished` / `gameId:left:userId` 형태의 eventId와 내용 검증으로 중복을 막는다. 엔진 잠금 안에서 판정을 확정하고 잠금 밖에서 발행한다. GameEventDelivery가 현재 프로세스의 불변 이벤트를 보관하고 별도 worker에서 DB 수신을 재시도한다. DB 수신 커밋이 ACK이며 정산 완료와 다르다. 최초 DB ACK 전 프로세스 종료의 이벤트 유실은 해결하지 않는다. 이탈 이벤트와 최종 판정의 역순 수신은 영속 metadata와 경기 행 잠금으로 처리한다.

이벤트는 금액·지갑 정보·정산 완료 상태를 포함하지 않는다. DB 담당은 자신의 트랜잭션에서 참가자/결과를 저장하고 예약금 정산을 수행한 뒤, 기존 `GameResultCommitted`로 확정된 결과를 전달한다. 이탈 직후 경기 전체를 정산하거나 통신부에서 금액을 계산하지 않는다. ERD의 leave_reason이 EXPLICIT_LEAVE/DISCONNECT_TIMEOUT만 허용한다면 LOGOUT/MEMBER_DEACTIVATED를 EXPLICIT_LEAVE로 매핑하는 저장 계약을 DB 담당과 확인한다.

명시적 로그아웃은 인증 담당이 LOGOUT 종료 사유를 전달해야 하며, 인증 코드를 임의로 수정하지 않았다. 상세한 즉시 이탈/30초 유예 구분은 [재접속 명세](game-reconnect.md)를 따른다.

## 결과 조회 메시지

```json
{
  "requestId": "result-1",
  "type": "GAME_RESULT_CHECK",
  "payload": {
    "gameSessionId": "701"
  }
}
```

서버가 인증한 내부 계정과 경기 ID를 `GameResultGateway.load()`에 전달한다. Gateway는 본인 참가 여부를 검사하고 저장된 종료 결과만 읽는다. 타인 경기·없는 경기·미종료 경기는 모두 빈 Optional로 처리하여 존재 여부를 노출하지 않는다. 관전자도 본인 참가 기록이 없으면 거절한다. dev 임시 사용자는 조회할 수 없다.

## 결과 수신

```json
{
  "requestId": "result-1",
  "type": "GAME_RESULT",
  "payload": {
    "version": 12,
    "gameSessionId": "701",
    "gameCode": "DICE",
    "status": "FINISHED",
    "endReason": "TURN_TIMEOUT",
    "settlementStatus": "PENDING",
    "betAmountPerPlayer": 1,
    "participants": [
      {
        "userId": "101",
        "result": "WIN"
      },
      {
        "userId": "202",
        "result": "LOSE"
      }
    ],
    "myCoinDelta": null,
    "endedAt": "2026-10-20T00:05:00Z"
  }
}
```

| 필드 | 규칙 |
| --- | --- |
| version | 경기별 결과 통신 버전, 0~9007199254740991 정수. 정산 상태만 바뀌어도 증가 |
| gameSessionId | 1~120자 String. DB Gateway 경계에서는 BIGINT ID의 십진수 문자열이며 엔진 gameId와 동일. DB 없는 로컬 fixture의 문자열 ID와 구분 |
| gameCode / endReason | 서버가 판정한 코드. 대문자 시작 영문·숫자·밑줄 1~32자. 예시가 모든 게임의 최종 코드 목록은 아님 |
| status | FINISHED / INVALID. 아직 진행 중인 경기는 이 종료 결과 메시지로 보내지 않음 |
| settlementStatus | PENDING / SETTLED. 경기 종료와 실제 정산 완료를 구분 |
| betAmountPerPlayer | 명세의 참가자별 판돈, 1~9007199254740991 정수. 통신부가 계산하지 않음 |
| participants | 최초 참가자 2~4명, 본인 포함·중복 ID 없음. FINISHED는 result 필수. INVALID는 엔진 판정이 없는 참가자에 한해 result=null 허용하며 기존 판정이 있으면 보존. null을 승패·무승부로 추정하지 않음 |
| myCoinDelta | PENDING은 null. SETTLED는 본인의 확정 순증감 정수(음수 가능). INVALID의 확정값은0. 지급 총액이나 지갑 잔액이 아님 |
| endedAt | 서버가 확정한 경기 종료 시각(UTC) |

SETTLED 알림은 위 형식에서 version을 증가시키고 settlementStatus를 SETTLED, myCoinDelta를 원장에 확정된 본인 순증감으로 보낸다. 통신부는 금액을 이동하거나 무승부·무효·장애의 예외 정산 규칙을 만들지 않는다.

INVALID/PENDING의 myCoinDelta는 null, INVALID/SETTLED는 0이다. GAME_RELEASE 원장으로
DB 확정 참가비 B의 예약을 해제하고 balance는 유지한다. 반환 안내의 B는 현재 테이블 설정이 아니라
해당 GAME_RESULT.betAmountPerPlayer를 사용한다. ABORTED_NO_PLAYERS도 이 INVALID 경로를 사용한다.

## 규칙 엔진 종료부터 결과 수신까지

1. 오목·주사위·원카드·거짓말 다리의 실제 종료 이벤트를 `GameFinishedResultListener`가 받는다. 기존 `GameStateChanged`는 참가자·관전자에게 공개 종료 상태를 전달하고, 종료 이벤트는 결과 저장 담당의 입력으로 사용할 수 있다. 종료 판정 자체가 DB 커밋 성공을 뜻하지 않는다.
2. 연결부는 현재 접속한 최초 참가자만 `GameResultGateway.load(userId, gameId)`로 비동기 1회 조회한다. 저장된 본인 결과의 자동 전달은 실제 시작부터 같은 경기 좌석을 유지한 현재 연결로 제한한다. `TABLE_LEFT` 이후 과거 경기 알림은 보내지 않는다. 관전자·타인에게 방송하지 않는다.
3. 아직 저장되지 않았거나 읽기가 실패하면 가짜 결과를 만들지 않는다. DB 수신 후 FINISHED/PENDING·INVALID/PENDING은 종결 재시도 worker가 정산/반환한다. 정산·반환과 같은 트랜잭션에 outbox를 저장하고 커밋 후 GameResultNotifications가 재전달한다. 프론트는 GAME_RESULT_CHECK로 같은 저장 결과를 다시 읽는다. 조회나 알림 재시도가 Wallet 지급을 다시 실행하지 않는다.
4. 자동 조회 중 같은 경기의 중복 종료는 추가 조회하지 않는다. 커밋 알림이 먼저 도착했다면 늦은 자동 조회의 같은/과거 버전은 버린다. 연결이 바뀌면 이전 조회 응답을 새 연결로 넘기지 않는다.
5. 결과 통신 version은 엔진의 착수 version과 별개다. 정산만 변경돼도 저장 결과의 version을 올려야 한다. 오프라인 복귀는 본인 경기 ID로 명시 재조회한다.

## 서버 담당 연결

수동 [GAME_FORFEIT](game-forfeit-api.md)는 공통 이탈 이벤트의 EXPLICIT_LEAVE를 사용한다.
중도 탈락만으로 전체 경기 정산을 요청하지 않으며 최종 GameFinished는 기존 단일 경로로 받는다.
기권 승인은 DB 정산 완료가 아니다. 결과 조회·커밋 후 알림 계약과 금액 계산은 변경하지 않는다.

1. 판정 수신(PENDING) 또는 정산/반환(SETTLED)과 **같은 DB 트랜잭션**에서 본인별 결과 스냅샷의 outbox를 저장한다. 커밋 후 GameResultNotifications가 StoredGameRoundEnded와 GameResultCommitted를 발행하고 전달 상태를 기록한다. outbox 기록 실패는 원래 DB 트랜잭션도 롤백한다. userId는 내부 수신자 확인용이며 클라이언트가 발행하는 이벤트가 아니다.
2. `GameResultService`의 전달을 `GameDeliveryScope`가 현재 연결·좌석 경기와 대조한다. requestId=null인 자동 GAME_RESULT는 같은 현재 경기만 전달하고 퇴장한 과거 경기는 생략한다. 시작 처리 도중 먼저 도착한 결과는 제한적으로 보관해 실제 시작 성공으로 확정된 경기만 전달한다. 명시 GAME_RESULT_CHECK의 본인 이력 응답은 좌석과 무관하게 유지한다. 채널·테이블·관전자에게 방송하지 않는다. JSON에는 내부 userId를 제외한다.
3. 결과의 userId와 myCoinDelta를 같은 사용자 기준으로 생성하는 것은 결과 담당의 책임이다. 연결부는 수신자의 참가 목록 포함, PENDING/null·SETTLED/확정값, 결과 조회의 사용자·경기 일치를 검사한다. 승패·원장 검증이나 중복 지급 방지는 결과 담당의 트랜잭션 책임이다.
4. 연결 중 최근64경기의 전달 버전만 보관해 중복/과거 자동 알림을 생략한다. 그보다 오래된 경기·새 연결에는 중복 억제 기록이 없으므로 프론트도 경기별 version을 비교한다. 같은 버전에 다른 결과를 만들지 않는다. 명시적 조회는 같은 버전도 응답한다.
   자동 저장 조회·명시 조회·커밋 알림 모두 출력 콜백에 정상 인계한 뒤에만 전달 버전을 기록한다. 인계 예외가 난 결과는 같은 버전의 커밋 알림으로 재시도할 수 있다. 이는 브라우저 수신 완료 ACK를 뜻하지 않는다.
5. 연결 종료 시 연결별 전달 버전 기록을 제거한다. outbox는 서버 내부 발행 재시도를 영속화하지만 클라이언트 수신 ACK나 오프라인 사용자별 수신함은 제공하지 않는다. 재접속한 프론트는 알고 있는 경기 ID로 GAME_RESULT_CHECK를 사용한다. 별도 결과 REST·알 수 없는 과거 경기 자동 발견 API는 없다.
6. 읽기 호출은 잠금 밖에서 수행한다. 명시 조회는 연결당 하나, 종료 자동 조회는 연결·경기당 하나만 동시에 실행한다. 명시 조회 중 더 최신 알림을 받으면 낮은 조회 결과는 GAME_RESULT_STALE로 끝내며, 자동 조회의 같은/과거 결과는 조용히 생략한다. 종료된 연결의 늦은 결과는 새 연결로 넘기지 않는다. Gateway의 외부 호출에는 자체 제한 시간이 필요하다.

개인 결과 JSON과 테이블 수명 관리는 구분한다. 2026-10-22 사용자 확정으로 실제 엔진 종료 때 준비를 전원 해제하고 좌석을 유지한 SETTLING으로 전환한다. 현재 경기·게임 코드·최초 참가자 집합·시작 시 고정한 참가비 B가 일치하는 경기 전체 SETTLED를 커밋 알림 또는 저장 조회(GameResultLoaded)로 확인하면 WAITING으로 돌아간다. 접속 중 좌석·선택 게임·목표는 유지하고, 미접속 예약 좌석은 기존 대기 정책대로 정리한다. 다시 전원 준비해야 새 경기를 시작한다. PENDING·실패·타 경기·잘못된 참가자 결과로 대기를 풀지 않는다. 결과 조회가 지급을 실행하지 않는 계약은 그대로다. 실제 엔진은 FINISHED/ELIMINATED와 공개 종료 상태를 기존 복구/관전 경로로 전달한다.

클라이언트의 승리 신고·정산 실행·금액 지정·수신 ACK 메시지는 없다. 반복 조회/알림은 지급을 호출하지 않는다.
현재 boot의 라운드는 GameTableRecovery가 신뢰된 DB 종결 결과와 table/game/B/참가자 집합을 대조해
SETTLING 고착을 복구한다. outbox는 적어도 한 번 서버 발행하며 같은 경기/version 중복은 수신자가 억제한다.
다중 노드 WebSocket 메시지 전달과 클라이언트 수신 완료 보장은 지원하지 않는다.

## 로컬 DB부터 프론트 잔액 갱신 신호까지 검증

`backend/tools/check-settlement-wallet-frontend.mjs`는 전용 loopback MySQL에서 실제 인증·판돈 예약·오목 정상 승리/수동 기권·정산/outbox·Raw WebSocket·지갑 HTTP 조회를 실행한 뒤, 그 실행의 응답만 현재 FE 파서와 잔액 갱신 모듈에 입력한다. 팀원 DB/FE 소스는 변경하지 않는다.

- 정산 전 보유액100/예약액5, SETTLED 수신 직후 승자105·패자95/예약액0을 확인한다. 프론트는 `myCoinDelta`를 로컬 잔액에 더하지 않고 `GET /api/v1/wallets/me`를 다시 읽는다.
- 중복 결과 조회·outbox 재확인에 원장이 늘지 않고, 같은 결과의 FE 갱신 신호도 한 번만 발생하는지 확인한다. 비참가자는 개인 결과를 받지 못한다.
- 정산 대기 중 TABLE_LEAVE는 기존 TABLE_BUSY다. 정산 후 퇴장·재접속은 LOBBY이며, 과거 결과는 자동 재전송하지 않고 본인 명시 조회로 확인한다.
- 실행 설정·결과 위치는 [흐름 검증](flow-test.md)을 따른다. 이 검증은 3D 화면의 잔액 표시나 개발 서버 배포 완료를 증명하지 않는다.

## 오류

기존 ERROR 형식이며 유효한 요청 ID를 복사한다. 엔진 예외 내용·타인 결과는 노출하지 않는다.

| 코드 | 의미 |
| --- | --- |
| INVALID_PAYLOAD | gameSessionId 누락·형식/길이 오류·추가 필드 |
| GAME_RESULT_AUTH_REQUIRED | 인증되지 않은 dev 연결 |
| GAME_RESULT_NOT_CONFIGURED | 결과 Gateway 미등록 |
| GAME_RESULT_PENDING | 같은 연결의 이전 조회 진행 중 |
| GAME_RESULT_ACCESS_DENIED | 본인 종료 결과 없음/접근 불가, 존재 여부 구분 안 함 |
| GAME_RESULT_INVALID | Gateway의 사용자·경기 불일치 |
| GAME_RESULT_UNAVAILABLE | 결과 읽기/검증 실패. 성공으로 처리하지 않음 |
| GAME_RESULT_STALE | 이미 전달한 결과보다 낮은 버전. 최신 알림을 유지하고 필요시 다시 조회 |

검증은 GameResultTests·GameFinishedResultTests·GameResultWebSocketTests와 CommittedStartFlowTests로 수행한다. 마지막 흐름은 실제 JWT·접속권·소켓·오목 30초 시간패 → 본인 자동 결과 → 커밋 알림 → heartbeat 단절·FINISHED 복귀·저장 결과 재조회를 포함한다. 계정 조회와 시작 차감/결과 저장·정산은 테스트 대역이며 실제 DB 저장·지급 성공을 뜻하지 않는다.

## Story 173 DB 연결

정상 종료 정산은 [가변 참가비·정산](game-settlement.md), 이탈 영속화·INVALID 반환·재전달은
[Story 174](game-recovery.md)를 따른다. 금액은 DB 확정 B를 사용하며 JSON 안전 정수 제한을 유지한다.
