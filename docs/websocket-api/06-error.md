# ⚠️ 오류 응답

> **ERROR** · 서버 → 클라이언트

| 항목 | 내용 |
| --- | --- |
| 도메인 | 공통 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | 없음 — 요청 검증·처리 실패 시 전송 |
| 응답·알림 요약 | 오류 code·message |
| 수신 대상 | 요청자 |

```json
{
  "requestId": "req-004",
  "type": "ERROR",
  "payload": {
    "code": "TABLE_FULL",
    "message": "빈 좌석이 없습니다."
  }
}
```

| code | 발생 조건 | 클라이언트 처리 |
| --- | --- | --- |
| `INVALID_JSON` | JSON 파싱 불가 | 요청 생성 코드 확인 |
| `INVALID_MESSAGE` | 루트·requestId·type·payload 공통 형식 오류 | 요청 형식 확인 |
| `UNSUPPORTED_MESSAGE_TYPE` | 형식은 맞지만 지원하지 않는 type | 지원 메시지로 수정 |
| `INVALID_PAYLOAD` | 메시지별 필드 누락·타입·허용 필드 오류 | 입력 수정 |
| `TABLE_NOT_FOUND` | 등록되지 않은 테이블 | 선택 가능한 테이블 사용 |
| `ALREADY_SEATED` | 다른 테이블에 착석 중 | 퇴장 완료 후 다시 착석 |
| `TABLE_FULL` | 빈 좌석 없음 | 다른 테이블 선택 또는 재시도 |
| `NOT_SEATED` | 미착석 상태의 준비·퇴장 요청 | 먼저 착석 |
| `NOT_GAME_SELECTOR` | 게임 선택 담당자가 아님 | 첫 착석자 또는 권한을 넘겨받은 참가자가 선택 |
| `GAME_NOT_SELECTED` | 게임 선택 전 준비 true 요청 | 게임 선택 후 다시 준비 |
| `GAME_PLAYER_LIMIT` | 현재 착석자가 선택하려는 게임 최대 인원보다 많음 | 인원이 줄어든 뒤 변경. 강제 퇴장 없음 |
| `UNSUPPORTED_GAME` | 지원하지 않는 게임 코드 | 허용된 게임 선택 |
| `TABLE_BUSY` | 선택적 시작 검증의 STARTING·CONFIRMED에서 변경 | 기존 시작 결과 확인. 새 변경 요청 반복 금지 |
| `INTERNAL_ERROR` | 예상치 못한 서버 처리 오류 | 오류 표시. 무조건 자동 재시도하지 않음 |

- 공통 형식 검사 → 지원 type 확인 → 개별 payload 검사 → 업무 상태 검사 순서로 검증합니다.
- 안전하게 읽을 수 있는 유효한 requestId가 있으면 복사하고, JSON 파싱 실패·식별자 자체 오류이면 null을 사용합니다.
- 예상 가능한 요청 오류는 상태 변경 없이 요청자에게만 응답하며 연결을 유지합니다.
- 클라이언트는 `code`로 분기합니다. `message`는 사용자 표시용이며 문자열 일치로 로직을 분기하지 않습니다.
- 내부 스택 트레이스·인증정보는 보내지 않습니다.
- `INTERNAL_ERROR`처럼 처리 여부가 확실하지 않은 상황에서는 연결을 다시 만들고 새 임시 사용자로 시작합니다. 기존 연결의 상태는 아래 종료 규칙으로 정리합니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
