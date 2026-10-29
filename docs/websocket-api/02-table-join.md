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
| `tableId` | string | O | 테이블 목록 응답의 ID. 채널 설정 환경에서는 서버 발급 table-UUID |

### 성공 처리

1. 서버가 존재 여부·채널 소속·현재 착석 위치·빈 좌석을 확인합니다. 채널 설정 시 먼저 CHANNEL_JOIN에 성공해야 합니다. 요청에 channelId나 userId를 추가하지 않습니다.
2. 비어 있는 좌석 중 번호가 가장 작은 좌석을 배정합니다.
3. 참가자 변경에 따라 테이블 참가자 전원의 준비를 `false`로 초기화합니다.
4. 테이블 `version`을 1 증가시킵니다.
5. 요청자에게 요청 ID를 포함한 `TABLE_STATE`, 기존 참가자에게 요청 ID가 null인 같은 상태를 전송합니다.

한 사용자는 한 테이블에만 착석합니다. 같은 테이블에 재요청하면 좌석을 중복 생성하지 않고 요청자에게 현재 상태만 응답합니다. 이 경우 준비 상태와 버전은 바뀌지 않습니다. 다른 테이블에 이미 착석했다면 자동 이동하지 않고 `ALREADY_SEATED`를 반환합니다.

시작 검증 모드에서는 최초·반복 착석의 `TABLE_STATE` 응답 뒤 본인에게 `requestId=null`인 `GAME_START_STATE`도 보냅니다. 실제 경기 시작 알림이 아닌 검증 상태입니다.

### 실패

- `INVALID_PAYLOAD`: tableId 누락·빈 문자열·타입 오류·허용하지 않은 필드.
- `TABLE_NOT_FOUND`: 형식은 올바르지만 등록되지 않은 tableId.
- `NOT_IN_CHANNEL`: 채널 설정 환경에서 채널 입장 전 착석 요청.
- `TABLE_CHANNEL_MISMATCH`: 현재 연결과 테이블의 채널이 다름.
- `ALREADY_SEATED`: 다른 테이블에 이미 착석.
- `TABLE_FULL`: 해당 테이블의 빈 좌석 없음.
- `TABLE_BUSY`: 시작 검증의 STARTING·CONFIRMED 테이블에 새로 착석하려는 경우. 같은 테이블 반복 착석은 현재 상태 조회로 처리합니다.
- `GAME_RECOVERY_REQUIRED`: 경기 담당이 등록된 인증 모드에서 복구 조회 중·진행 경기·만료 미확정 상태.

여러 조건이 겹치면 payload 검증 → 인증 사용자의 경기 복구 상태 확인 → 테이블 존재 확인 → 채널 소속 확인(설정 환경) → 본인 착석 위치 확인 → 시작 검증 상태 → 정원 확인 순서로 판정합니다. 실패 시 기존 착석·준비 상태는 유지합니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
