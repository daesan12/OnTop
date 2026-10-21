# 경기 종료·정산 결과 전송 연결부

OnTop v0.4의 서버 결과 판정과 기존 [GAME-03 결과 조회](https://app.notion.com/p/3ff161842b8680709b63cf6e8d1efc2b)의 필드를 따른다. local 인증 연결에서 동작한다. 4종 엔진의 규칙상 종료·승패 판정은 구현했지만, 이 결과 API가 읽는 실제 저장 결과 Gateway·정산 계산·원장·DB·로그인은 미연결이다. 아래 두 WS 메시지는 로컬 연결 계약이며 2026-10-20 기존 Notion 양식과 Postman 웹에 반영하고 저장된 JSON·속성을 재조회했다. 2026-10-21 상태 대조에서도 두 항목은 진행 중으로 유지한다. 기존 REST 담당 구현이나 정산 정책을 바꾸지 않는다.

## 결과 조회

```json
{"requestId":"result-1","type":"GAME_RESULT_CHECK","payload":{"gameSessionId":"701"}}
```

서버가 인증한 내부 계정과 경기 ID를 `GameResultGateway.load()`에 전달한다. Gateway는 본인 참가 여부를 검사하고 저장된 종료 결과만 읽는다. 타인 경기·없는 경기·미종료 경기는 모두 빈 Optional로 처리하여 존재 여부를 노출하지 않는다. 관전자도 본인 참가 기록이 없으면 거절한다. dev 임시 사용자는 조회할 수 없다.

## 결과 수신

```json
{
  "requestId":"result-1",
  "type":"GAME_RESULT",
  "payload":{
    "version":12,
    "gameSessionId":"701",
    "gameCode":"DICE",
    "status":"FINISHED",
    "endReason":"NORMAL",
    "settlementStatus":"PENDING",
    "betAmountPerPlayer":1,
    "participants":[{"userId":"101","result":"WIN"},{"userId":"202","result":"LOSE"}],
    "myCoinDelta":null,
    "endedAt":"2026-10-20T00:05:00Z"
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

SETTLED 알림은 위 형식에서 version을 증가시키고 settlementStatus를 SETTLED, myCoinDelta를 원장에 확정된 본인 순증감으로 보낸다. 무승부·무효는 기존 정책대로 예약만 해제하며 통신부는 금액을 이동하거나 예외 정산 규칙을 만들지 않는다.

## 서버 담당 연결

1. 결과 저장 또는 정산 **커밋 성공 뒤** 본인별 `GameResultView`를 생성하고 `ApplicationEventPublisher.publishEvent(new GameResultCommitted(view))`를 발행한다. 이벤트는 클라이언트 요청이 아니며 userId는 내부 수신자 확인용이다.
2. `GameResultService`가 같은 내부 계정의 현재 인증 연결에만 requestId=null의 GAME_RESULT를 보낸다. 채널·테이블·관전자에게 방송하지 않는다. JSON에는 내부 userId를 제외한다.
3. 결과의 userId와 myCoinDelta를 같은 사용자 기준으로 생성하는 것은 결과 담당의 책임이다. 연결부는 수신자의 참가 목록 포함, PENDING/null·SETTLED/확정값, 결과 조회의 사용자·경기 일치를 검사한다. 승패·원장 검증이나 중복 지급 방지는 결과 담당의 트랜잭션 책임이다.
4. 연결 중 최근64경기의 전달 버전만 보관해 중복/과거 자동 알림을 생략한다. 그보다 오래된 경기·새 연결에는 중복 억제 기록이 없으므로 프론트도 경기별 version을 비교한다. 같은 버전에 다른 결과를 만들지 않는다. 명시적 조회는 같은 버전도 응답한다.
5. 연결 종료 시 기록을 제거한다. 오프라인 알림은 저장하지 않으며, 재접속한 프론트는 알고 있는 경기 ID로 GAME_RESULT_CHECK 또는 팀원의 결과 REST를 재조회한다. 접속 자체로 과거 결과를 자동 방송하지 않는다.
6. 읽기 호출은 잠금 밖에서 수행하고 연결당 조회 하나만 실행한다. 진행 중 더 최신 알림을 받으면 낮은 조회 결과는 GAME_RESULT_STALE로 끝낸다. 종료된 연결의 늦은 결과는 새 연결로 넘기지 않는다. Gateway의 외부 호출에는 자체 제한 시간이 필요하다.

결과 알림은 게임 입력 권한·테이블 좌석·로비 전환·관전 구독을 직접 바꾸지 않는다. 경기 담당은 기존 GameRecoveryGateway에 FINISHED/ELIMINATED와 최신 버전을 반영하고 GAME_RECONNECT_CHECK에 답해야 하며, 관전 공개 상태는 기존 GameStateChanged 경로를 사용한다. 같은 테이블의 새 게임 전환·자동 좌석 해제는 이번 범위가 아니다.

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

검증은 GameResultTests와 GameResultWebSocketTests의 인증·결과 대역으로 수행한다. 실제 정산 성공을 뜻하지 않는다.
