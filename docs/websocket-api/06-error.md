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
| `TABLE_CHANNEL_MISMATCH` | 현재 채널과 테이블 소속이 다름 | 현재 채널 목록에서 선택 |
| `ALREADY_SEATED` | 다른 테이블에 착석 중 | 퇴장 완료 후 다시 착석 |
| `TABLE_FULL` | 빈 좌석 없음 | 다른 테이블 선택 또는 재시도 |
| `NOT_SEATED` | 미착석 상태의 준비·퇴장 요청 | 먼저 착석 |
| `NOT_GAME_SELECTOR` | 게임 선택 담당자가 아님 | 첫 착석자 또는 권한을 넘겨받은 참가자가 선택 |
| `GAME_NOT_SELECTED` | 게임 선택 전 준비 true 요청 | 게임 선택 후 다시 준비 |
| `GAME_PLAYER_LIMIT` | 현재 착석자가 선택하려는 게임 최대 인원보다 많음 | 인원이 줄어든 뒤 변경. 강제 퇴장 없음 |
| `UNSUPPORTED_GAME` | 지원하지 않는 게임 코드 | 허용된 게임 선택 |
| `CHANNEL_NOT_FOUND` | 등록되지 않은 채널 | 채널 목록 확인 |
| `ALREADY_IN_CHANNEL` | 다른 채널에 입장 중 | 기존 채널 퇴장 후 입장 |
| `CHANNEL_FULL` | 채널 정원 초과 | 다른 채널 선택 |
| `NOT_IN_CHANNEL` | 채널 미입장 상태의 퇴장 또는 설정 환경에서 착석 | 현재 입장 상태 확인 |
| `TABLE_BUSY` | 착석 중 채널 변경·퇴장 또는 선택적 시작 검증의 STARTING·CONFIRMED에서 변경 | 기존 시작 결과 확인. 새 변경 요청 반복 금지 |
| `GAME_RECOVERY_REQUIRED` | 경기 조회 중·진행 중·만료 미확정 상태의 테이블 변경 | GAME_CONNECTION_STATE 확인 |
| `RECOVERY_NOT_AVAILABLE` | 임시 개발 사용자 등 복구 연결 대상이 아님 | 인증 연결 설정 확인 |
| `START_NOT_REQUESTED` | 시작 검증 모드에서 시작 시도 없이 결과 조회 | 게임 선택·전원 준비 이후 조회 |
| `INTERNAL_ERROR` | 예상치 못한 서버 처리 오류 | 오류 표시. 무조건 자동 재시도하지 않음 |

- 공통 형식 검사 → 지원 type 확인 → 개별 payload 검사 → 업무 상태 검사 순서로 검증합니다.
- 안전하게 읽을 수 있는 유효한 requestId가 있으면 복사하고, JSON 파싱 실패·식별자 자체 오류이면 null을 사용합니다.
- 예상 가능한 요청 오류는 상태 변경 없이 요청자에게만 응답하며 연결을 유지합니다.
- 클라이언트는 `code`로 분기합니다. `message`는 사용자 표시용이며 문자열 일치로 로직을 분기하지 않습니다.
- 내부 스택 트레이스·인증정보는 보내지 않습니다.
- `INTERNAL_ERROR`처럼 처리 여부가 불확실하면 무조건 자동 재전송하지 않습니다. 기본 dev 재연결은 새 사용자이며 대기 좌석은 정리됩니다. 인증 계정은 `GAME_RECONNECT_CHECK`와 `GAME_CONNECTION_STATE`로 경기 복구 상태를 확인합니다.
- 핸드셰이크의 HTTP 401·503과 중복 연결의 close 1008은 `ERROR` JSON이 아닙니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
