# 📡 테이블 상태 알림

> **TABLE_STATE** · 서버 → 클라이언트

2026-10-22 추가: payload.targetScore는 DICE의 선택 목표2000/4000/6000, 다른 게임은 null이다. 목표 변경도 전원 준비를 초기화한다. 실제 종료 시 좌석 유지·전원 준비=false 상태를 전송한다. 정산 대기/재준비 단계는 GAME_START_STATE의 SETTLING/WAITING으로 구분한다.

| 항목 | 내용 |
| --- | --- |
| 도메인 | 테이블 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | 없음 — 상태 변경 시 전송 |
| 응답·알림 요약 | 좌석·준비·전원 준비·상태 버전 |
| 수신 대상 | 요청자 또는 같은 테이블 참가자 |

착석·게임 선택·준비 요청의 성공 응답 또는 참가자·선택 게임·준비 상태 변경 알림으로 전송합니다.

```json
{
  "requestId": "req-002",
  "type": "TABLE_STATE",
  "payload": {
    "tableId": "table-1",
    "version": 5,
    "capacity": 2,
    "minimumPlayers": 2,
    "seats": [
      {
        "seatNumber": 1,
        "userId": "dev-7cc07e8b-8460-4a78-8897-5e9acd875d91",
        "ready": true
      },
      {
        "seatNumber": 2,
        "userId": "dev-78a686ef-a217-473e-a694-3d2e32cb035c",
        "ready": false
      }
    ],
    "allReady": false,
    "selectorUserId": "dev-7cc07e8b-8460-4a78-8897-5e9acd875d91",
    "gameCode": "DICE",
    "targetScore": 4000,
    "betAmountPerPlayer": 5,
    "gameId": null
  }
}
```

| payload 필드 | 타입 | 설명 |
| --- | --- | --- |
| `tableId` | string | 테이블 식별자 |
| `version` | integer | 테이블별 상태 버전. 서버 시작 시 0, 실제 변경마다 1 증가 |
| `capacity` | integer | 게임별 최대 인원. 오목·주사위 2, 원카드·거짓말·미선택 4 |
| `minimumPlayers` | integer | 전원 준비 판정 최소 인원. 현재 네 게임 모두 2 |
| `seats` | array | 빈 좌석을 포함한 전체 좌석. seatNumber 오름차순 |
| `seats[].seatNumber` | integer | 1부터 capacity까지의 좌석 번호 |
| `seats[].userId` | string 또는 null | 기본 dev ID / 인증 연결 모드 내부 ID 문자열. 빈 좌석이면 null |
| `seats[].ready` | boolean | 준비 여부. 빈 좌석은 false |
| `allReady` | boolean | 게임 선택·최소 인원 충족 및 현재 착석자 전원 준비. 빈 좌석은 제외 |
| `selectorUserId` | string 또는 null | 현재 참가자 중 가장 먼저 착석한 사용자. 위 userId와 같은 규격. 빈 테이블이면 null |
| `gameCode` | string 또는 null | 선택한 게임 코드. 미선택이면 null. [게임 선택](07-game-select.md) 참고 |
| `targetScore` | integer 또는 null | DICE 목표 2000/4000/6000. 다른 게임·미선택은 null |
| `gameId` | string 또는 null | 확정 PLAYING 경기의 공개 ID. 대기·시작 결과 미확정·리허설·거절·종료·정산 대기는 null |

빈 좌석은 다음과 같이 표현합니다.

```json
{
  "seatNumber": 2,
  "userId": null,
  "ready": false
}
```

- 변경분만 보내지 않고 전체 상태를 전송합니다.
- 경기 시작 확정 때도 version을 증가시켜 gameId를 전송합니다. 종료는 null, 다음 판은 새 ID입니다. GAME_START_STATE/GAME_RESULT의 상세 시작·정산 계약은 유지합니다.
- 같은 테이블의 참가자에게만 전송합니다. 다른 테이블·미착석 연결에는 전송하지 않습니다.
- 서버는 상태 처리 순서대로 각 연결에 메시지를 전달합니다. 클라이언트는 같은 테이블의 마지막 적용 버전보다 작은 상태를 무시합니다.
- 같은 버전은 중복 요청의 정상 응답일 수 있습니다. requestId에 따른 요청 완료 처리는 수행하고, 화면 상태는 동일하게 유지합니다.
- 새 WebSocket 연결을 만들면 기존 화면·버전 캐시·미완료 요청을 초기화합니다. 서버 재시작 후 과거 버전과 비교하지 않습니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)

## 참가비 필드 추가

`betAmountPerPlayer`: selector가 확정한 1인 참가비(양의 안전 정수), 게임 미선택/빈 테이블은 null. 금액 변경 시 전원 준비를 해제하고 version을 증가시킨다. 선택권 승계와 종료 후 대기 복귀는 확정 금액을 유지한다. 참가자는 이 값을 확인하고 준비한다. 상세: [가변 참가비·정산](../game-settlement.md).
