# ✅ 준비·준비 취소

> **READY_SET** · 클라이언트 → 서버

| 항목 | 내용 |
| --- | --- |
| 도메인 | 테이블 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | ready: true 또는 false |
| 응답·알림 요약 | TABLE_STATE / ERROR |
| 수신 대상 | 요청자·같은 테이블 참가자 |

### 요청

```json
{
  "requestId": "req-002",
  "type": "READY_SET",
  "payload": {
    "ready": true
  }
}
```

| payload 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `ready` | boolean | O | 준비 true, 준비 취소 false |

문자열 `"true"`, 숫자 1, null은 허용하지 않습니다. 현재 연결의 사용자와 착석 테이블을 서버에서 확인하므로 tableId·userId를 보내지 않습니다.

### 성공 처리

- 요청자의 준비 상태만 변경합니다.
- 실제 값이 바뀌면 버전을 1 증가시키고 모든 참가자에게 `TABLE_STATE`를 전송합니다. 요청자 응답만 요청 ID를 포함합니다.
- 이미 같은 값이면 변경 없이 요청자에게 현재 상태를 응답합니다. 버전 증가·다른 참가자 알림은 없습니다.
- 2명 모두 준비하면 `allReady=true`입니다. 한 명만 착석했다면 그 사람이 준비해도 `allReady=false`입니다.
- 전원 준비 상태에서도 준비 취소·퇴장이 가능합니다. 실제 경기 상태로 전환하지 않습니다.

### 실패

- `INVALID_PAYLOAD`: ready 누락·타입 오류·허용하지 않은 필드.
- `NOT_SEATED`: 현재 사용자가 어느 테이블에도 착석하지 않음.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
