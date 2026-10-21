# 🔗 연결 완료

> **CONNECTED** · 서버 → 클라이언트

| 항목 | 내용 |
| --- | --- |
| 도메인 | 연결 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | 없음 |
| 응답·알림 요약 | 기본 모드 임시 userId / 인증 연결 모드 검증된 내부 ID 문자열 |
| 수신 대상 | 연결한 본인 |

서버가 연결마다 한 번 전송합니다. 클라이언트 요청은 없습니다.

```json
{
  "requestId": null,
  "type": "CONNECTED",
  "payload": {
    "userId": "dev-7cc07e8b-8460-4a78-8897-5e9acd875d91"
  }
}
```

위 예시는 기본 개발 모드의 임시 ID이며 ERD 계정 ID가 아닙니다. 선택적 [인증 연결 모드](../websocket-authentication.md)는 서버 검증기가 반환한 양수 내부 사용자 ID를 문자열로 전송합니다(예: `"101"`). JSON 필드 이름·타입은 동일합니다. Access JWT로 발급받은 30초 1회용 접속권을 연결 시 소비하고 DB 계정 상태를 확인합니다. 클라이언트가 요청으로 이 ID를 지정할 수 없습니다. 접속권 발급·오류·재접속 순서는 인증 연결 모드를 참고합니다.

인증 모드에 경기 담당 `GameRecoveryGateway`까지 등록돼 있으면 `CONNECTED` 다음 자동 `GAME_CONNECTION_STATE`를 확인합니다. 경기 담당이 없으면 자동 복구 알림 없이 대기 기능을 사용할 수 있습니다. 이때 명시적 `GAME_RECONNECT_CHECK`는 `UNAVAILABLE / RECOVERY_NOT_CONFIGURED`를 반환합니다. 자동 알림을 무조건 기다리지 않습니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
