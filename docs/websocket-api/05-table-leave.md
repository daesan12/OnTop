# 🚪 테이블 퇴장

> **TABLE_LEAVE / TABLE_LEFT** · 요청: 클라이언트 → 서버 / 완료: 서버 → 클라이언트

| 항목 | 내용 |
| --- | --- |
| 도메인 | 테이블 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | 빈 객체 {} |
| 응답·알림 요약 | 본인 TABLE_LEFT / 남은 참가자 TABLE_STATE / 실패 ERROR |
| 수신 대상 | TABLE_LEFT는 본인, 상태 변경은 남은 참가자 |

### 요청

```json
{
  "requestId": "req-003",
  "type": "TABLE_LEAVE",
  "payload": {}
}
```

현재 연결의 사용자가 착석한 테이블에서 퇴장합니다. 테이블·사용자·좌석을 별도 지정하지 않습니다.

### 본인 응답

```json
{
  "requestId": "req-003",
  "type": "TABLE_LEFT",
  "payload": {
    "tableId": "table-1"
  }
}
```

### 상태 변화

- 본인의 좌석을 비우고 남은 참가자의 준비를 false로 초기화합니다.
- 테이블 버전을 1 증가시킵니다.
- 퇴장 요청자에게 `TABLE_LEFT`, 남은 참가자에게 요청 ID가 null인 `TABLE_STATE`를 전송합니다.
- 퇴장한 연결에는 해당 테이블의 이후 상태를 보내지 않습니다. 퇴장 후 다른 테이블에 착석할 수 있습니다.
- 모든 참가자가 나가도 개발용 테이블은 유지합니다. 테이블이 비었다는 이유로 버전을 초기화하지 않습니다.
- 선택자가 나가면 남은 참가자 중 가장 먼저 착석한 사람에게 선택 권한을 넘깁니다. 남은 사람이 있으면 게임 선택은 유지하고, 빈 테이블이면 `gameCode`·`selectorUserId`는 null입니다.

### 실패

- `INVALID_PAYLOAD`: payload가 빈 객체가 아님. 공통 형식 오류는 `INVALID_MESSAGE`입니다.
- `NOT_SEATED`: 이미 미착석 상태. 반복 퇴장은 성공으로 위장하지 않고 이 오류를 반환합니다.
- `TABLE_BUSY`: 시작 검증의 STARTING·CONFIRMED 상태에서 퇴장 요청.
- `GAME_RECOVERY_REQUIRED`: 경기 담당이 등록된 인증 모드에서 복구 조회 중·진행 경기·만료 미확정 상태. 착석 여부 검사보다 먼저 확인합니다.

실패 시 기존 좌석·준비 상태를 유지합니다. 실제 경기 기권 요청으로 사용하지 않습니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
