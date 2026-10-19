# 🔗 연결 완료

> **CONNECTED** · 서버 → 클라이언트

| 항목 | 내용 |
| --- | --- |
| 도메인 | 연결 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | 없음 |
| 응답·알림 요약 | 임시 userId |
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

`userId`는 개발용 표시·참가자 식별 문자열이며 ERD의 BIGINT `users.id`가 아닙니다. 실제 인증 연결 시 계정 식별 규격은 별도로 정의합니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
