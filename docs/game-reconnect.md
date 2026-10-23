# 경기 재접속 연결부

**같은 계정의 기존 연결이 있으면 새 연결만 1008로 종료한다.** 서버가 끊김을 확인한 뒤 30초 안에 돌아오면 경기 담당에게 최신 상태를 받아 본인에게만 보낸다. 30초 경계부터는 만료다. 턴을 멈추거나 시간을 다시 주지 않는다.

기준: [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71), 사용자 확인(2026-10-19). 2인 경기는 기권, 원래 3~4인 경기는 탈락 요청을 보낸다. AI 대행은 없다.

## 현재 구현 범위

`local`의 인증 모드에서 동작하는 **연결부**다. 선택적 [오목](omok.md)·[주사위](farkle.md)·[원카드](onecard.md)·[거짓말 다리](bridge.md) 엔진이 실제 상태·차례·마감 복구를 제공한다. 오목·주사위 복구 state는 평면 형식, 원카드·다리는 publicState/privateState 중첩 형식이며 각 계약을 따른다. 인증 담당의 `WebSocketUserResolver`가 필요하며 실제 로그인·시작 차감·DB 정산은 미연결이다. 테스트에서 인증·참가 확정을 주입하며 운영 코드에 임의 계정/경기를 생성하지 않는다. 개발용 시작 검증의 `demo-game`은 복구 대상으로 사용하지 않는다.

| 파일 | 역할 |
| --- | --- |
| `GameReconnectService` | 계정별 연결·30초 유예·복구·만료 재시도 관리 |
| `GameRecoveryGateway` | 경기 담당에게 현재 상태 조회와 만료 처리를 부탁하는 인터페이스 |
| `GameRecoverySnapshot` | 한 사용자에게 보여도 되는 경기 상태와 버전 |

인증 모드에 경기 담당 `GameRecoveryGateway`가 등록된 경우 연결 직후 `CONNECTED` 다음 `GAME_CONNECTION_STATE`가 온다. 조회 중에는 테이블 변경을 막는다. 경기 담당이 없으면 자동 조회 없이 기존 대기 기능을 유지하며, 명시적 복구 조회는 `UNAVAILABLE / RECOVERY_NOT_CONFIGURED`다. 이 상태를 복구 성공으로 표시하지 않는다.

## 메시지

경기 담당이 등록된 인증 연결에서 자동 조회한다. 조회 실패·처리 중에는 같은 연결에서 다음 요청으로 다시 확인할 수 있다. 사용자·경기 ID는 서버에서 정하므로 요청에 넣지 않는다.

```json
{
  "requestId": "check-1",
  "type": "GAME_RECONNECT_CHECK",
  "payload": {}
}
```

```json
{
  "requestId": "check-1",
  "type": "GAME_CONNECTION_STATE",
  "payload": {
    "status": "RESTORED",
    "gameId": "game-1",
    "version": 8,
    "state": {
      "turnDeadline": "2026-10-19T07:00:30Z"
    },
    "reconnectUntil": null,
    "code": null
  }
}
```

`state` 예시는 형식 설명이다. 게임별 필드는 경기 담당이 정의한다. `version`은 동일 경기에서 감소하지 않아야 한다. `reconnectUntil`은 미확정 복구의 원래 유예 마감 시각이며, 복구 완료 시 null이다.

| status | 뜻 / 클라이언트 처리 |
| --- | --- |
| `PENDING` | 조회 중. 경기 입력·테이블 변경 대기 |
| `RESTORED` | 현재 연결에 본인의 최신 경기 상태 반영 |
| `LOBBY` | 진행 중인 경기 없음. 착석 가능 |
| `FINISHED` / `ELIMINATED` | 종료 / 본인 탈락 상태 전달. 테이블 이용 가능 |
| `EXPIRED` | 유예 만료 처리 요청 후 엔진이 아직 PLAYING을 반환. 경기 정보·조작권을 주지 않고 재확인 |
| `UNAVAILABLE` | 조회 실패 또는 연결할 경기 담당 없음. 성공으로 처리하지 않고 재확인 |

자동 조회의 requestId는 null이다. 명시적 조회는 PENDING과 최종 응답에 요청 ID를 붙인다. 이미 조회 중이면 요청 ID를 붙인 PENDING만 보내며, 기존 조회의 최종 결과를 상태 알림으로 받는다. 프론트는 requestId와 별개로 모든 GAME_CONNECTION_STATE를 반영한다.

개발용 임시 사용자의 조회는 `ERROR / RECOVERY_NOT_AVAILABLE`, 추가 payload 필드는 `INVALID_PAYLOAD`다. 복구 중·진행 중 경기·만료 미확정 상태의 테이블 요청은 `GAME_RECOVERY_REQUIRED`다.

## 경기 담당 연결 계약

1. `load(userId)`는 서버가 인증한 **내부 계정 ID**로 현재 경기를 찾는다. 경기 ID를 클라이언트에서 받지 않는다. 없음은 빈 Optional, 진행/종료/탈락은 해당 Snapshot을 반환한다. `participantCount`는 최초 경기 인원이다.
2. Snapshot의 `state`에는 공개 정보와 **해당 사용자 자신의 비공개 정보만** 넣는다. 다른 사람의 패 등은 경기 담당이 반드시 제거한다. 본인 ID 불일치·같은 경기의 낮은 버전은 연결부도 거절한다.
3. 연결부는 턴을 정지하거나 재시작하지 않는다. 경기 담당의 현재 턴·원래 마감 시각을 그대로 받는다. 늦게 끝난 이전 연결의 조회는 새 연결에 전달하지 않는다.
4. 30초가 지나면 `graceExpired`에 eventId·userId·gameId·단절/마감 시각·FORFEIT/ELIMINATE를 보낸다. 경기 담당은 **eventId로 멱등 처리**하고 해당 경기의 참가자가 여전히 진행 중일 때만 적용한다. 이미 종료된 경기에는 중복 기권·정산을 만들지 않는다. 예외 시 같은 eventId로 재시도한다.
5. 만료 성공 후에도 현재 상태를 다시 읽는다. 오프라인 사용자의 종료가 확인되면 복구 기록을 제거한다. 엔진이 계속 진행 중이라고 하면 복귀를 허용하지 않는다.
6. `GAME_ACTION_SEND`는 `TableHub.sendGameAction()`에서 `canControlGame(userId, sessionId, gameId)`를 확인한 뒤 입력 Gateway를 잠금 밖에서 호출한다. 호출 직전에도 현재 연결의 복구 권한을 확인한다. 실제 턴·현재 참가 자격·중복 입력 검증은 경기 담당 `GameActionGateway` 구현체의 책임이며 4종 엔진은 GameEngineRouter를 통해 해당 경기의 규칙을 처리한다. [입력 연결 계약](game-action-api.md)을 함께 따른다.

30초는 클라이언트의 추정 단절 시각이 아니라 **서버의 종료 감지 시각**부터다. [heartbeat](websocket-heartbeat.md)가 응답 없는 연결을 감지하면 같은 종료 경로로 전달한다. 다중 서버·재시작 후 복구는 아직 없고 연결 기록은 메모리에 있다. 복구 조회 실패 후 다시 끊겨도 최초 유예를 연장하지 않는다. 유예 안에 복구가 완료된 뒤 다시 끊기면 새 유예다.

## 종료 사유별 게임 이탈 · 2026-10-23

`TableHub.disconnect(sessionId, ConnectionCloseReason)`가 서버에서 확인한 사유를 복구 서비스로 전달한다. 클라이언트 JSON으로 종료 사유를 지정하는 API는 추가하지 않는다.

| 서버 종료 사유 | 처리 |
| --- | --- |
| `LOGOUT` | 명시적 로그아웃. 30초 대기 없이 기권/탈락 요청 |
| `MEMBER_DEACTIVATED` | 회원 탈퇴. 기존 인증 종료 경로에서 즉시 기권/탈락 요청 |
| `SOCKET_CLOSED`, `TRANSPORT_ERROR`, `HEARTBEAT_TIMEOUT`, 송신 실패 등 | 기존 30초 재접속 유예 |
| `AUTH_SESSION_REVOKED` | 원인이 불명확한 인증 계열 폐기. 로그아웃으로 추정하지 않고 기존 유예 유지 |

AUTH의 Revoked.reason=LOGOUT은 ConnectionCloseReason.LOGOUT으로 전달한다. REFRESH_REUSE_DETECTED와
SESSION_REVOKED는 AUTH_SESSION_REVOKED로 전달하며 일괄 즉시 기권으로 바꾸지 않는다. 탈퇴는 기존 회원 전체
MEMBER_DEACTIVATED/4403 전달을 재사용한다. 이번 AUTH 변경에서 Hub·복구 서비스·게임 엔진은 수정하지 않았다.
이미 정리된 연결의 오프라인 30초 유예에 후속 사유를 적용하거나, 먼저 종료한 사유를 후속 이벤트로 승격하지 않는다.
게임 복구 상태에는 로그인 sid 연결이 없어 userId만으로 오프라인 경기를 강제 기권시키지 않는다.
자세한 이벤트·행동 로그 계약은 [세션 종료 원인](session-invalidation.md#auth-종료-원인과-소비자-계약)을 따른다.

내부 `GraceExpiration`에 `GameDepartureReason`을 추가했다. 기존 6인자 생성자는 `DISCONNECT_TIMEOUT`을 사용한다. 즉시 이탈은 단절 시각=마감 시각이며 기존 비동기 조회·동일 eventId 재시도·경기별 멱등 판정을 재사용한다. 2인은 기권, 최초3~4인은 참가자 탈락이고 남은 경기는 계속한다. 이탈 후 다시 연결해도 참가 자격을 되살리지 않는다. 먼저 도래한 오목 시간패 등 이미 확정된 종료를 로그아웃으로 덮지 않는다.

거짓말 다리는 기존 규칙대로 판정 진행 중이면 말 제거를 판정 경계까지 보류하지만, 해당 사용자의 게임 입력 자격은 즉시 해제한다. 연결부가 턴·판정 과정을 강제 변경하지 않는다. 공통 종료·이탈 이벤트는 [결과 명세](game-result-api.md)에 정의한다.

## 검증 범위

`GameReconnectTests`는 Clock을 움직여 29/30초·2/3/4인 만료·중복 처리·오래된 응답·정보 검증·오프라인 정리를 확인한다. `GameReconnectWebSocketTests`는 실제 랜덤 포트 소켓으로 재접속·본인 상태·테이블 변경 차단·만료 후 재확인을 검사한다. 이 두 검사는 인증·경기 대역을 사용한다. 실제 4종 엔진의 복구·타이머·개인 정보 검증은 각 게임의 FlowTests와 실행 계약을 별도로 따른다. 실제 로그인·DB 정산 검증은 아니다.

`TransportFailureRecoveryTests`는 전송 IOException·송신 큐 초과를 실제 Hub/복구 서비스에 연결한다. 느린 send/close가 인터럽트에 응답하지 않아도 다른 사용자의 요청과 종료 정리가 진행되는지, 서버 감지 후29초 복귀·30초 기권/탈락·중복 종료 정리를 확인한다. 제어 시계·WebSocketSession/경기 대역을 사용한 통합 검사이며 실제 네트워크 장애·성능 측정·정산 검증이 아니다.
