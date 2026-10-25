# 수동 기권 · GAME_FORFEIT

담당자 장대산 · 로컬 구현·검증 완료 · 개발 서버 미배포.
FE의 2026-10-25 BE_HANDOFF 수동 기권 요청과 기존 경기 이탈 규칙을 연결한다.
기존 로그인·접속권·Raw WebSocket `/ws/tables`를 사용한다.

## 요청

```json
{
  "requestId": "forfeit-1",
  "type": "GAME_FORFEIT",
  "payload": {
    "gameId": "game-1",
    "actionId": "forfeit-1"
  }
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| requestId | string | 1~64자, 응답 연결용 |
| payload.gameId | string | 1~120자, 현재 본인이 복구한 경기 ID |
| payload.actionId | string | 1~64자, 버튼 요청 식별자 |

공백만인 식별자는 거절한다. userId·결과·금액·reason·cancel 등 추가 필드는 받지 않는다.
본인 차례가 아니어도 가능하며 expectedVersion은 필요하지 않다. 관전자·타인·미복구 연결은 거절한다.

## 성공 응답

```json
{
  "requestId": "forfeit-1",
  "type": "GAME_FORFEIT_RESULT",
  "payload": {
    "gameId": "game-1",
    "actionId": "forfeit-1",
    "version": 1,
    "duplicate": false
  }
}
```

- 같은 경기·참가자의 기권은 한 번만 확정한다. 재전송·재클릭은 `duplicate:true`, 최초 확정 version과 요청의 actionId를 반환한다. 기권/종료 이벤트를 다시 발행하지 않는다.
- 영수증은 현재 프로세스 메모리에 있다. 재시작·다중 서버 영속 멱등성은 보장하지 않는다. 새 경기를 복구한 뒤 이전 경기 명령은 거절한다.
- 소켓·로그인·채널 유지, 일반 단절의 30초 유예 없이 기권한다. 기권 전 시작한 늦은 복구 조회는 세대 번호로 무효화해 참가 자격을 되살리지 못하게 한다.
- 본인에게 GAME_CONNECTION_STATE의 PENDING → FINISHED/ELIMINATED를 재전송한다. 참가자·권한 있는 관전자에게 기존 GAME_STATE를 전달한다. 승인 응답과 상태 알림 순서는 보장하지 않는다. requestId/actionId와 상태 version을 각각 처리한다.
- 오목·주사위 2인은 상대 승리다. 원카드·거짓말 다리는 본인 탈락 후 남은 경기 진행, 마지막 생존자에서 종료한다. 원카드 기권 손패는 이번 경기에서 제외한다.
- 다리 선언·판단 중 기권은 기존 pendingForfeit 판정 경계를 유지한다. 참가권한·개인 주사위는 즉시 제거하고 말/슬롯 제거는 현재 판정 경계에서 적용한다.
- 먼저 도래한 오목 시간패·완료 결과를 기권으로 덮지 않는다. 본인의 수동 기권 영수증이 없는 종료 경기는 거절한다.
- 되돌리는 명령은 제공하지 않는다. 버튼 확인창·문구는 FE 협의 목록에 남긴다. 좌석은 기존 경기 종료 → 정산 확인 → 대기 정책을 유지하며 기권 승인이 TABLE_LEFT를 뜻하지 않는다.
- 기권 확정 뒤 승인 응답을 못 받고 끊겼다면 새 접속권 → FINISHED 복구 → 원래 테이블의 CHANNEL_JOIN → 같은 gameId/actionId로 재확인한다. duplicate:true가 최초 반영을 확인하며 이탈·종료 이벤트는 늘어나지 않는다. 정산 대기 좌석을 이유로 원래 채널 복귀를 막지 않는다. 다른 채널 이동은 계속 금지한다.
- PENDING 결과는 다음 판을 열지 않는다. 저장 결과 조회 또는 커밋 알림에서 전체 SETTLED 확인 후에도 전원이 다시 준비해야 시작한다. 새 경기 복구 후 과거 기권·종료·정산 알림은 새 판을 변경하지 않는다.

## 결과 저장·정산 경계

GameParticipantLeft.leaveReason=EXPLICIT_LEAVE를 최초 한 번 발행한다. 전체 종료 때 기존 GameFinished에
모든 최초 참가자의 WIN/LOSE/DRAW/FORFEIT와 이탈 시각을 전달한다. 3~4인 중도 탈락만으로 전체 정산하지 않는다.
예약금 유지·최종 DB 정산은 기존 저장 담당 계약이다. GAME_FORFEIT_RESULT는 지급 영수증이 아니다.
실제 저장된 본인 결과는 GAME_RESULT_CHECK/GAME_RESULT로 확인한다. DB/Entity/Flyway·인증·금액 계산은 변경하지 않는다.

## 오류

기존 ERROR 형식과 요청 requestId를 사용한다.

| 코드 | 의미 |
| --- | --- |
| INVALID_PAYLOAD | 누락·타입·길이·추가 필드 |
| GAME_FORFEIT_AUTH_REQUIRED | 인증 회원 연결 아님 |
| GAME_FORFEIT_NOT_CONFIGURED | 경기 입력 Gateway 미등록 |
| GAME_RECOVERY_REQUIRED | 현재 연결/본인 경기 복구 확인 필요 |
| GAME_ACTION_PENDING | 같은 연결의 입력·기권 처리 중 |
| GAME_FORFEIT_ACCESS_DENIED | 경기 없음 또는 참가자 아님 |
| GAME_FORFEIT_GAME_FINISHED | 이미 종료, 본인 수동 기권 영수증도 없음 |
| GAME_FORFEIT_NOT_ACTIVE | 다른 사유로 이미 탈락 |
| GAME_FORFEIT_INVALID_ACTION | 입력 전용 Gateway 등 기권 미지원 |
| GAME_FORFEIT_INVALID | Gateway 반환 사용자·경기·요청 불일치 |
| GAME_FORFEIT_UNAVAILABLE | 처리 상태 불명확, 자동 재시도 대신 상태 확인 |

검증은 ManualForfeitEngineTests·ManualForfeitFlowTests·GameReconnectTests·TableProtocolTests다.
실제 4종 엔진·로컬 서버 Raw WebSocket과 인증 조회 대역을 사용한다. 실제 DB 정산·FE 버튼·배포 검증과 구분한다.

TableGameIdFlowTests는 실제 JWT·일회용 접속권·HTTP/RawWS로 기권→SETTLING→결과 PENDING→
SETTLED→같은 테이블 다음 판을 확인한다. 커밋 알림·알림 유실 후 결과 조회·기권 승인 유실 후 재접속의
3경로를 검사한다. 예약·결과 저장·정산은 대역이며 기존 계정 조회도 fixture다. 신규 SQL과 DB 지급 검증은 없다.

MultiplayerForfeitFlowTests는 원카드·거짓말다리 각각 3인/4인의 중도 기권 → ELIMINATED 복귀 →
남은 참가자 경기 유지 → 최종 종료 → 전체 최초 참가자 결과 조회 → 전원 재준비·다음 판을 검증한다.
부분 참가자만 있는 SETTLED로 다음 판을 열지 않고, 원래 채널 복귀·다른 채널 차단·관전자 비공개 정보 제외·
중복 기권/과거 이벤트 차단도 확인한다. 새 원카드 판은 기권자에게도 새 손패 7장을 배분하며 다음 판 실제 입력까지 확인한다.
이 검증은 실제 JWT/접속권/HTTP/RawWS·규칙 엔진과 계정·예약/결과 저장 대역을 연결한다. FE 화면·실제 DB 지급 검증은 아니다.
