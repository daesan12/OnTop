# 경기 재접속 연결부

**같은 계정의 기존 연결이 있으면 새 연결만 1008로 종료한다.** 서버가 끊김을 확인한 뒤 30초 안에 돌아오면 경기 담당에게 최신 상태를 받아 본인에게만 보낸다. 30초 경계부터는 만료다. 턴을 멈추거나 시간을 다시 주지 않는다.

기준: [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71), 사용자 확인(2026-10-19). 2인 경기는 기권, 원래 3~4인 경기는 탈락 요청을 보낸다. AI 대행은 없다.

## 현재 구현 범위

`local`의 인증 모드에서 동작하는 **연결부**다. 실제 로그인·경기 엔진·DB는 아직 없다. 인증 담당의 `WebSocketUserResolver`와 경기 담당의 `GameRecoveryGateway` Bean이 필요하다. 테스트에만 인증·경기 대역이 있으며 운영 코드에 임의 계정/경기를 생성하지 않는다. 개발용 시작 검증의 `demo-game`은 복구 대상으로 사용하지 않는다.

| 파일 | 역할 |
| --- | --- |
| `GameReconnectService` | 계정별 연결·30초 유예·복구·만료 재시도 관리 |
| `GameRecoveryGateway` | 경기 담당에게 현재 상태 조회와 만료 처리를 부탁하는 인터페이스 |
| `GameRecoverySnapshot` | 한 사용자에게 보여도 되는 경기 상태와 버전 |

인증 연결 직후 `CONNECTED` 다음 `GAME_CONNECTION_STATE`가 온다. 조회 중에는 테이블 변경을 막는다. 경기 담당이 없으면 자동 조회 없이 기존 대기 기능을 유지하며, 명시적 복구 조회는 `UNAVAILABLE / RECOVERY_NOT_CONFIGURED`다. 이 상태를 복구 성공으로 표시하지 않는다.

## 메시지

연결 직후 자동 조회한다. 조회 실패·처리 중에는 같은 연결에서 다음 요청으로 다시 확인할 수 있다. 사용자·경기 ID는 서버에서 정하므로 요청에 넣지 않는다.

```json
{"requestId":"check-1","type":"GAME_RECONNECT_CHECK","payload":{}}
```

```json
{
  "requestId":"check-1",
  "type":"GAME_CONNECTION_STATE",
  "payload":{
    "status":"RESTORED",
    "gameId":"game-1",
    "version":8,
    "state":{"turnDeadline":"2026-10-19T07:00:30Z"},
    "reconnectUntil":null,
    "code":null
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
6. 실제 경기 입력 핸들러를 붙일 때 `canControlGame(userId, sessionId, gameId)`와 엔진의 현재 참가 자격을 함께 확인한다. 이 저장소에는 아직 경기 입력 핸들러가 없다.

30초는 클라이언트의 추정 단절 시각이 아니라 **서버의 종료 감지 시각**부터다. [heartbeat](websocket-heartbeat.md)가 응답 없는 연결을 감지하면 같은 종료 경로로 전달한다. 다중 서버·재시작 후 복구는 아직 없고 연결 기록은 메모리에 있다. 복구 조회 실패 후 다시 끊겨도 최초 유예를 연장하지 않는다. 유예 안에 복구가 완료된 뒤 다시 끊기면 새 유예다.

## 검증

`GameReconnectTests`는 Clock을 움직여 29/30초·2/3/4인 만료·중복 처리·오래된 응답·정보 검증·오프라인 정리를 확인한다. `GameReconnectWebSocketTests`는 실제 랜덤 포트 소켓으로 재접속·본인 상태·테이블 변경 차단·만료 후 재확인을 검사한다. 실제 로그인과 경기 엔진 연동 성공을 뜻하지 않는다.
