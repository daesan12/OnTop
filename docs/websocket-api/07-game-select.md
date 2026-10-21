# 🎮 게임 선택

**GAME_SELECT · 클라이언트 → 서버 · `/ws/tables`**

기준: [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71)와 2026-10-22 사용자 확정. 첫 착석자가 게임·주사위 목표를 선택한다. 실제 엔진 시작 연결과 DB 차감/정산 담당은 구분한다.

## 요청

```json
{
  "requestId": "select-001",
  "type": "GAME_SELECT",
  "payload": {
    "gameCode": "DICE",
    "targetScore": 4000
  }
}
```

| gameCode | 게임 | 기획서의 인원 |
| --- | --- | --- |
| OMOK | 오목 | 2명 |
| DICE | 주사위 한 판 | 2명 |
| ONE_CARD | 원카드 | 2~4명 |
| LIAR_BRIDGE | 거짓말 다리 건너기 | 2~4명 |

코드는 메시지 식별자이며 ERD 게임 ID와 구분한다. 미선택 테이블은 4석이고 게임 선택 후 위 표의 최대 인원으로 바뀐다. DICE는 targetScore 정수2000/4000/6000 중 하나가 필수다. 생략하면 GAME_OPTIONS_REQUIRED, 다른 값/형식 또는 다른 게임에 targetScore를 보내면 INVALID_PAYLOAD다. 다른 게임은 기존 gameCode만 보낸다. 서버가 임의 기본 목표로 시작하지 않는다.

현재 참가자가 게임 정원보다 많으면 `GAME_PLAYER_LIMIT`로 거절하며 선택·좌석·준비·버전을 유지한다. 강제 퇴장은 없다. 2명 이하가 남아 2인 게임으로 변경하면 착석 순서대로 좌석을 1~2번으로 재배치하고 전원 준비를 초기화한다. 정원·좌석 변화는 새 TABLE_STATE로 반영한다.

## 처리와 응답

- 서버가 현재 연결의 착석 테이블·사용자를 찾는다. 요청에 `tableId`, `userId`, 선택 담당자를 보내지 않는다.
- 대기 중인 테이블에서 **현재 남아 있는 참가자 중 가장 먼저 착석한 사람**만 선택한다. 좌석 번호와 착석 순서는 다르다.
- 게임을 처음 선택하거나 다른 게임으로 바꾸면 전원 준비를 false로 만들고 상태 버전을 1 올린다. 같은 테이블 모두에게 [TABLE_STATE](04-table-state.md)를 전송한다. 요청자에게만 requestId가 들어간다.
- 같은 게임·같은 목표를 다시 선택하면 버전·준비를 유지하고 요청자에게 현재 TABLE_STATE만 응답한다. 주사위 목표를 바꾸면 전원 준비를 초기화하며 새 targetScore를 TABLE_STATE/TABLE_WATCH_STATE와 TABLE-01 요약에 반영한다. DICE 외에는 null이다.
- 게임 미선택 상태에서는 `ready=true`를 거절한다. 선택 후 각 참가자가 준비해야 하며 선택 자체가 준비를 뜻하지 않는다.
- 선택 담당자가 대기 중 퇴장·연결 종료하면 착석 순서가 다음인 참가자에게 권한을 넘긴다. **2026-10-19 사용자 확인 규칙**이며 원문의 누락을 보완했다. 남은 참가자가 있으면 기존 선택은 유지하고, 아무도 없으면 선택을 지운다. 인원 변경 시 준비 초기화는 기존 규칙을 따른다.
- STARTING·CONFIRMED·PLAYING·SETTLING 동안 변경은 TABLE_BUSY다. 실제 종료 시 전원 준비를 해제하고 좌석을 유지한다. 저장된 경기 전체 SETTLED를 확인하면 WAITING으로 돌아가며 다시 전원 준비해야 새 경기로 시작한다. 미접속 예약 좌석은 대기 전환 시 기존 대기 정책에 따라 정리한다.
- 시작 검증을 켰다면 대기 상태의 GAME_START_STATE에도 선택 gameCode를 반영한다. 전원 준비 후 시작 요청에는 그 게임과 참가자 스냅샷을 고정한다.

## 오류

| code | 조건 |
| --- | --- |
| INVALID_PAYLOAD | gameCode 누락·null·타입 오류·빈 문자열·추가 필드 |
| NOT_SEATED | 현재 연결이 미착석 |
| NOT_GAME_SELECTOR | 선택 담당자가 아닌 참가자의 요청 |
| UNSUPPORTED_GAME | 지원하지 않는 코드. 대소문자를 구분 |
| GAME_OPTIONS_REQUIRED | DICE의 targetScore 누락 |
| GAME_NOT_SELECTED | 게임 선택 전 READY_SET true |
| GAME_PLAYER_LIMIT | 현재 착석 인원이 선택하려는 게임 최대 인원보다 많음 |
| TABLE_BUSY | 시작 요청 중·검증 완료 후 변경 |

실패 응답은 요청자에게만 ERROR로 보낸다. 실패 시 버전·선택·준비를 바꾸지 않는다.

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
