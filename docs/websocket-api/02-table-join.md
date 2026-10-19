# 🪑 테이블 착석

> **TABLE_JOIN** · 클라이언트 → 서버

| 항목 | 내용 |
| --- | --- |
| 도메인 | 테이블 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | tableId |
| 응답·알림 요약 | TABLE_STATE / ERROR |
| 수신 대상 | 요청자·같은 테이블 참가자 |

### 요청

```json
{
  "requestId": "req-001",
  "type": "TABLE_JOIN",
  "payload": {
    "tableId": "table-1"
  }
}
```

| payload 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `tableId` | string | O | `table-1` 또는 `table-2` |

### 성공 처리

1. 서버가 존재 여부·현재 착석 위치·빈 좌석을 확인합니다.
2. 비어 있는 좌석 중 번호가 가장 작은 좌석을 배정합니다.
3. 참가자 변경에 따라 테이블 참가자 전원의 준비를 `false`로 초기화합니다.
4. 테이블 `version`을 1 증가시킵니다.
5. 요청자에게 요청 ID를 포함한 `TABLE_STATE`, 기존 참가자에게 요청 ID가 null인 같은 상태를 전송합니다.

한 사용자는 한 테이블에만 착석합니다. 같은 테이블에 재요청하면 좌석을 중복 생성하지 않고 요청자에게 현재 상태만 응답합니다. 이 경우 준비 상태와 버전은 바뀌지 않습니다. 다른 테이블에 이미 착석했다면 자동 이동하지 않고 `ALREADY_SEATED`를 반환합니다.

### 실패

- `INVALID_PAYLOAD`: tableId 누락·빈 문자열·타입 오류·허용하지 않은 필드.
- `TABLE_NOT_FOUND`: 형식은 올바르지만 등록되지 않은 tableId.
- `ALREADY_SEATED`: 다른 테이블에 이미 착석.
- `TABLE_FULL`: 해당 테이블의 빈 좌석 없음.

여러 조건이 겹치면 payload 검증 → 테이블 존재 확인 → 본인 착석 위치 확인 → 정원 확인 순서로 판정합니다. 실패 시 기존 착석·준비 상태는 유지합니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
