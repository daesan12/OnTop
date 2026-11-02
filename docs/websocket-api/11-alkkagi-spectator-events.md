# 알까기 관전자 훈수

로컬 구현·검증 범위. 기존 인증 `/ws/tables`를 사용한다. 실제 개발 서버 활성화·배포는 별도다.
누구나 기존 관전 버튼으로 들어갈 수 있다. 방장 승인 과정은 없다. 기존 GAME_WATCH의 같은 채널·테이블20m·미착석 검사 후 첫 GAME_STATE를 받아야 발신할 수 있다.

## 요청

```json
{
  "requestId": "advice-1",
  "type": "ALKKAGI_SPECTATOR_SEND",
  "payload": {
    "gameId": "서버 경기 ID",
    "eventId": "0cccab6b-13a8-42da-85bd-377ee115225b",
    "basedOnVersion": 3,
    "kind": "ADVICE",
    "pieceId": "p0",
    "dx": 0.8,
    "dy": -0.6,
    "power": 0.8
  }
}
```

훈수는 kind=ADVICE, x/y 대신 pieceId/dx/dy/power를 보낸다. 예: `{"pieceId":"p0","dx":0.8,"dy":-0.6,"power":0.8}`.
최신 AIMING 상태의 현재 차례 살아 있는 알만 대상이다. 방향 길이0.0001~1.0001, power는0초과1이하, 좌표는 판 내부 유한수여야 한다. 추가 필드·발신자 위조는 INVALID_PAYLOAD다.

## 응답·일시 방송

ALKKAGI_SPECTATOR_EVENT: 원 requestId는 발신자 확인, null requestId는 같은 경기 참가자·관전자에게 방송한다.
공통 payload는 gameId/eventId/senderUserId/kind/basedOnVersion/turnNumber/sentAt/expiresAt/serverNow다. kind별 입력 좌표 또는 정규화한 방향·힘을 포함한다. 시각은 Unix ms다.

- 2026-11-02 UI 정책: 마우스 이동은 전송하지 않고 커서 링·커서 닉네임도 표시하지 않는다. 구버전 CURSOR 수신도 표시 없이 무시한다. 서버의 기존 CURSOR 처리(최소80ms·유효2초)는 호환용으로 남지만 현행 클라이언트에서는 사용하지 않는다.
- 훈수: 최소600ms, 유효4초. 파란 방향 화살표만 표시한다. 충돌 예측·실제 알 이동·차례 변경이 아니다.
- 같은 eventId·같은 내용은 원 사건 시각으로 발신자에게만 재확인하며 재방송하지 않는다. 다른 내용은 ID_CONFLICT, 만료 후에는 EXPIRED다.
- 최신 버전과 다르거나 충돌·카드선택·종료 상태면 거절한다. 프론트도 발사/단계·버전 전환에서 지우므로 추가 발사 때 과거 훈수가 재등장하지 않는다.
- 퇴장·관전 해제·접속 종료·다른 경기 전환 시 수신 범위를 닫는다. 재접속/신규 관전에 과거 표시를 복구하지 않는다.
- 손패·카드 후보는 전송하지 않는다. 관전 채팅은 기존 GAME_SPECTATOR_CHAT_SEND를 그대로 사용한다.

오류: GAME_SPECTATOR_AUTH_REQUIRED, GAME_SPECTATOR_ACCESS_DENIED, GAME_SPECTATOR_GAME_NOT_PLAYING,
ALKKAGI_SPECTATOR_STALE_VERSION/NOT_AIMING/INVALID_TARGET/INVALID_DIRECTION/OUTSIDE_BOARD/TOO_FREQUENT/ID_CONFLICT/EXPIRED.

검증: AlkkagiSpectatorFlowTests(실제 인증 티켓·소켓, 메모리 예약/정산), AlkkagiSpectatorPolicyTests,
alkkagiSpectatorEvents.test.ts. 공용 DB/스키마/인증 구현 변경 없음.
