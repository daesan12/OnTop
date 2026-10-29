# 공통 경기 입력 전달 연결부

본인 버튼 기권은 별도 [GAME_FORFEIT](game-forfeit-api.md)를 사용한다. GAME_ACTION_SEND의 input에 넣지 않는다.

OnTop v0.4의 서버 판정·재접속 정책을 따르는 local/dev 및 운영 `prod,db` 연결부다. 선택적으로 켜는 [오목](omok.md)·[주사위](farkle.md)·[원카드](onecard.md)·[거짓말 다리](bridge.md) 엔진이 입력·상태·복구 Gateway를 구현한다. 기존 JWT·접속권을 사용하며 실제 DB 예약·정산은 별도 연결한다. 운영과 local/dev 혼합 프로필은 제외하며 활성화 조건은 [경기 시작 안내](committed-game-start.md#켜는-조건)를 따른다. 2026-10-20 Notion에 입력 전달·처리 확인 항목을 반영하고 아래 로컬 통신 계약과 대조했다. 기존 준비·시작·복구 규칙은 변경하지 않는다.

## 입력과 처리 확인

```json
{
  "requestId": "request-1",
  "type": "GAME_ACTION_SEND",
  "payload": {
    "gameId": "game-1",
    "actionId": "action-1",
    "expectedVersion": 8,
    "input": {
      "x": 3
    }
  }
}
```

`input`은 게임 담당이 검증할 JSON 객체다. 위 좌표는 형식 예시이며 특정 게임의 확정 명세가 아니다. userId·역할·결과를 클라이언트가 지정하지 않는다. gameId는 1~120자, actionId는 1~64자이며 공백만인 값은 거절한다. expectedVersion은 현재 화면에서 본 경기 버전인 0~9007199254740991 정수다. 기존 소켓 메시지 크기 제한도 적용한다.

```json
{
  "requestId": "request-1",
  "type": "GAME_ACTION_RESULT",
  "payload": {
    "gameId": "game-1",
    "actionId": "action-1",
    "version": 9
  }
}
```

서버가 검증한 내부 계정으로 기존 재접속 서비스의 해당 경기 조작 가능 여부를 확인한 뒤 `GameActionGateway.apply()`에 전달한다. 관전자·미복구·다른 경기 입력은 전달하지 않는다. 참가/턴/종료 여부·게임별 필드·버전 검사는 경기 담당이 실제 변경과 함께 다시 검사한다.

처리 확인은 요청자에게만 보내고 입력·손패·상태는 포함하지 않는다. 입력이 반영되면 진행 경기 참가자와 권한이 확인된 관전자에게 [GAME_STATE](game-state-api.md)를 각각 전송한다. GAME_STATE_CHECK로도 재확인할 수 있다. 실제 입력은 [오목](omok.md)·[주사위](farkle.md)·[원카드](onecard.md)·[거짓말 다리](bridge.md) 계약을 따른다.

## 중복·끊김·실패

- requestId는 전송 요청의 응답 연결용이다. actionId는 하나의 행동을 식별한다. 같은 행동을 재확인할 때는 같은 actionId·expectedVersion·input을 유지한다.
- **중복 반영 방지는 경기 담당의 책임**이다. Gateway 구현은 경기 잠금/트랜잭션 안에서 `(userId, gameId, actionId)`의 같은 내용에 기존 결과를 반환하고 다른 내용은 충돌로 거절해야 한다. 이 연결부는 영속 중복 제거를 구현하지 않는다.
- 연결 하나의 입력은 한 번에 하나만 처리한다. 느린 엔진 호출은 Hub 잠금 밖에서 실행하므로 다른 연결의 요청을 막지 않는다. 입력 JSON은 복사해 외부 변경을 막는다.
- 엔진 전달 직전까지 현재 연결과 조작권을 다시 검사한다. **전달 이후 끊김은 이미 접수된 행동을 취소하지 않는다.** 엔진은 턴 마감과 실행 시점의 참가 자격을 함께 검사해야 한다. 종료된 연결의 늦은 응답을 새 연결로 전달하지 않는다.
- 엔진 예외나 잘못된 결과는 반영 실패를 확정하지 않는다. 자동 재전송하지 말고 경기 상태를 조회한다. 다른 actionId로 다시 보내면 중복 행동이 될 수 있다.
- 별도 입력 타임아웃/강제 취소는 없다. 경기 담당의 DB·외부 호출은 자체 제한 시간을 두어야 한다.

## 오류

기존 ERROR 형식이며 유효한 requestId를 복사한다. 엔진 예외 내용은 전송·기록하지 않는다.

| 코드 | 의미 |
| --- | --- |
| INVALID_PAYLOAD | 누락·형식·허용되지 않은 최상위 입력 필드 |
| GAME_ACTION_AUTH_REQUIRED | dev 사용자, 실제 인증 필요 |
| GAME_ACTION_NOT_CONFIGURED | 입력 담당 Gateway 미등록 |
| GAME_RECOVERY_REQUIRED | 해당 경기 조작권/복구 완료 상태 아님 |
| GAME_ACTION_PENDING | 같은 연결의 이전 입력 진행 중 |
| GAME_ACTION_ACCESS_DENIED | 엔진에서 참가 권한 없음/경기 없음. 존재 여부 구분 안 함 |
| GAME_ACTION_INVALID_ACTION | 게임 규칙상 잘못된 입력 |
| GAME_ACTION_FORBIDDEN_MOVE | 오목 흑의 33·44·장목 금수. 판·버전·차례·턴 마감 유지 |
| GAME_ACTION_NOT_YOUR_TURN | 현재 차례 아님 |
| GAME_ACTION_STALE_VERSION | 경기 상태가 바뀜 |
| GAME_ACTION_ACTION_ID_CONFLICT | 같은 행동 ID에 다른 내용 |
| GAME_ACTION_INVALID | 엔진의 사용자·경기·행동·버전 결과 불일치 |
| GAME_ACTION_UNAVAILABLE | 엔진 예외, 실제 반영 여부 불명 |

검증은 단위 테스트와 실제 소켓·엔진 흐름 테스트로 한다. 회원 조회·예약·결과 저장 대역 검증을 실제 DB 정산 완료로 표시하지 않는다. local의 dev-* 임시 사용자 연결에서는 AUTH_REQUIRED가 정상이며 인증 우회 헤더를 추가하지 않는다. dev 프로필의 실제 회원 연결과 임시 사용자는 구분한다.

입력 처리 확인과 자동 상태 알림의 도착 순서는 보장하지 않는다. 엔진 변경 이벤트로 GAME_STATE가 GAME_ACTION_RESULT보다 먼저 올 수 있다. 프론트는 확인 응답을 requestId/actionId로 연결하고, 상태는 version을 기준으로 독립 처리하며 낮은 버전으로 화면을 되돌리지 않는다.
