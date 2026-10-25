# 경기 종료·정산 결과 전송 연결부

OnTop v0.4의 서버 결과 판정과 기존 [GAME-03 결과 조회](https://app.notion.com/p/3ff161842b8680709b63cf6e8d1efc2b)의 필드를 따른다. local/dev 인증 연결에서 등록된다(prod/production 혼합 시 제외). 실제 Access JWT·1회용 접속권 및 4종 규칙 엔진은 연결했다. 결과 저장 Gateway·정산 계산·원장·DB는 별도 담당이다. 아래 두 WS 메시지의 기존 필드는 유지하며, 실제 DB 연동을 포함한 상태는 진행 중이다. 기존 REST 담당 구현이나 정산 정책을 바꾸지 않는다.

## 공통 경기 종료·이탈 이벤트 · 2026-10-23

아래는 서버 내부 Spring 이벤트이며 새 WebSocket 메시지가 아니다. `GAME_RESULT_CHECK` / `GAME_RESULT`의 기존 JSON 필드는 유지한다. 게임별 기존 종료 이벤트도 호환 목적으로 유지하며, DB 소비자는 공통 이벤트 또는 게임별 이벤트 중 한 경로만 구독한다.

| 이벤트 | 필드 / 의미 |
| --- | --- |
| `GameParticipantLeft` | eventId, gameId, tableId, gameCode, version, userId, leaveReason, leftAt. 경기 참가 자격 상실 시 한 번 발행. 3~4인 경기 중도 이탈에도 경기 전체 종료를 기다리지 않음 |
| `GameFinished` | eventId, gameId, tableId, gameCode, version, participants, endReason, endedAt. 최초 참가자 전체의 최종 판정 |
| `GameFinished.Participant` | 내부 long userId, result(WIN/LOSE/DRAW/FORFEIT), nullable leaveReason/leftAt. 먼저 이탈한 참가자도 최종 결과에 포함 |

`gameCode`는 OMOK/DICE/ONE_CARD/LIAR_BRIDGE. `leaveReason`은 LOGOUT/MEMBER_DEACTIVATED/DISCONNECT_TIMEOUT이며, 일반 패배나 턴 시간패는 이탈 사유가 없고 LOSE다. 이탈자는 FORFEIT, 그 외 엔진의 승자 목록은 WIN, 나머지는 LOSE, 승자 없는 무승부는 DRAW다. 말 제거가 보류된 다리 기권도 입력 자격 상실 시 이탈 이벤트를 내보낸다. 이 이벤트는 말 제거 완료를 뜻하지 않는다.

중복 종료/이탈 요청은 추가 판정을 만들지 않는다. 소비자는 `gameId:finished` / `gameId:left:userId` 형태의 eventId를 중복 방지 키로 사용한다. 한 변경에서 이탈 이벤트가 최종 종료 이벤트보다 먼저 발행되며, 이전 이탈 사유·시각은 최종 결과에도 유지된다. 엔진 잠금 안에서 판정을 확정하고 잠금 밖에서 이벤트를 발행한다. 알림은 메모리 기반이며 재시작/리스너 실패 후 영속 재전달은 보장하지 않는다.

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
    "endReason": "NORMAL",
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
| gameSessionId | 기존 결과 REST의 경기 ID, 1~120자. 경기 상태 메시지의 gameId와 같은 서버 경기 식별자 |
| gameCode / endReason | 서버가 판정한 코드. 대문자 시작 영문·숫자·밑줄 1~32자. 예시가 모든 게임의 최종 코드 목록은 아님 |
| status | FINISHED / INVALID. 아직 진행 중인 경기는 이 종료 결과 메시지로 보내지 않음 |
| settlementStatus | PENDING / SETTLED. 경기 종료와 실제 정산 완료를 구분 |
| betAmountPerPlayer | 명세의 참가자별 판돈, 1~9007199254740991 정수. 통신부가 계산하지 않음 |
| participants | 최초 참가자 2~4명의 userId 문자열·서버 판정 result 코드. 중복 ID 없음, 본인 포함. 손패·타인 지갑·개별 증감액 없음 |
| myCoinDelta | PENDING은 null. SETTLED는 본인의 확정 순증감 정수(음수 가능). INVALID의 확정값은0. 지급 총액이나 지갑 잔액이 아님 |
| endedAt | 서버가 확정한 경기 종료 시각(UTC) |

SETTLED 알림은 위 형식에서 version을 증가시키고 settlementStatus를 SETTLED, myCoinDelta를 원장에 확정된 본인 순증감으로 보낸다. 통신부는 금액을 이동하거나 무승부·무효·장애의 예외 정산 규칙을 만들지 않는다.

## 규칙 엔진 종료부터 결과 수신까지

1. 오목·주사위·원카드·거짓말 다리의 실제 종료 이벤트를 `GameFinishedResultListener`가 받는다. 기존 `GameStateChanged`는 참가자·관전자에게 공개 종료 상태를 전달하고, 종료 이벤트는 결과 저장 담당의 입력으로 사용할 수 있다. 종료 판정 자체가 DB 커밋 성공을 뜻하지 않는다.
2. 연결부는 현재 접속한 최초 참가자만 `GameResultGateway.load(userId, gameId)`로 비동기 1회 조회한다. 저장된 본인 결과가 있으면 `requestId=null`인 `GAME_RESULT`를 보낸다. 관전자·타인은 조회하거나 방송하지 않는다.
3. 아직 저장되지 않았거나 읽기가 실패하면 자동 결과·자동 오류를 보내지 않는다. 가짜 PENDING/SETTLED나 증감액을 만들지 않는다. 이후 저장/정산 담당이 커밋 후 발행하는 `GameResultCommitted`로 수신하거나 프론트가 `GAME_RESULT_CHECK`로 다시 읽는다. 주기적인 DB 폴링은 없다.
4. 자동 조회 중 같은 경기의 중복 종료는 추가 조회하지 않는다. 커밋 알림이 먼저 도착했다면 늦은 자동 조회의 같은/과거 버전은 버린다. 연결이 바뀌면 이전 조회 응답을 새 연결로 넘기지 않는다.
5. 결과 통신 version은 엔진의 착수 version과 별개다. 정산만 변경돼도 저장 결과의 version을 올려야 한다. 오프라인 복귀는 본인 경기 ID로 명시 재조회한다.

## 서버 담당 연결

1. 결과 저장 또는 정산 **커밋 성공 뒤** 본인별 `GameResultView`를 생성하고 `ApplicationEventPublisher.publishEvent(new GameResultCommitted(view))`를 발행한다. 이벤트는 클라이언트 요청이 아니며 userId는 내부 수신자 확인용이다.
2. `GameResultService`가 같은 내부 계정의 현재 인증 연결에만 requestId=null의 GAME_RESULT를 보낸다. 채널·테이블·관전자에게 방송하지 않는다. JSON에는 내부 userId를 제외한다.
3. 결과의 userId와 myCoinDelta를 같은 사용자 기준으로 생성하는 것은 결과 담당의 책임이다. 연결부는 수신자의 참가 목록 포함, PENDING/null·SETTLED/확정값, 결과 조회의 사용자·경기 일치를 검사한다. 승패·원장 검증이나 중복 지급 방지는 결과 담당의 트랜잭션 책임이다.
4. 연결 중 최근64경기의 전달 버전만 보관해 중복/과거 자동 알림을 생략한다. 그보다 오래된 경기·새 연결에는 중복 억제 기록이 없으므로 프론트도 경기별 version을 비교한다. 같은 버전에 다른 결과를 만들지 않는다. 명시적 조회는 같은 버전도 응답한다.
5. 연결 종료 시 기록을 제거한다. 오프라인 알림은 저장하지 않으며, 재접속한 프론트는 알고 있는 경기 ID로 GAME_RESULT_CHECK 또는 팀원의 결과 REST를 재조회한다. 접속 자체로 과거 결과를 자동 방송하지 않는다.
6. 읽기 호출은 잠금 밖에서 수행한다. 명시 조회는 연결당 하나, 종료 자동 조회는 연결·경기당 하나만 동시에 실행한다. 명시 조회 중 더 최신 알림을 받으면 낮은 조회 결과는 GAME_RESULT_STALE로 끝내며, 자동 조회의 같은/과거 결과는 조용히 생략한다. 종료된 연결의 늦은 결과는 새 연결로 넘기지 않는다. Gateway의 외부 호출에는 자체 제한 시간이 필요하다.

개인 결과 JSON과 테이블 수명 관리는 구분한다. 2026-10-22 사용자 확정으로 실제 엔진 종료 때 준비를 전원 해제하고 좌석을 유지한 SETTLING으로 전환한다. 현재 경기·게임 코드·최초 참가자 집합·판돈1이 일치하는 경기 전체 SETTLED를 커밋 알림 또는 저장 조회(GameResultLoaded)로 확인하면 WAITING으로 돌아간다. 접속 중 좌석·선택 게임·목표는 유지하고, 미접속 예약 좌석은 기존 대기 정책대로 정리한다. 다시 전원 준비해야 새 경기를 시작한다. PENDING·실패·타 경기·잘못된 참가자 결과로 대기를 풀지 않는다. 결과 조회가 지급을 실행하지 않는 계약은 그대로다. 실제 엔진은 FINISHED/ELIMINATED와 공개 종료 상태를 기존 복구/관전 경로로 전달한다.

클라이언트의 승리 신고·정산 실행·금액 지정 메시지는 추가하지 않는다. 이벤트를 재수신하거나 결과를 반복 조회해도 지급 처리를 호출하지 않는다. 메모리 알림은 프로세스 재시작·다중 서버·전달 보장을 제공하지 않는다.

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
