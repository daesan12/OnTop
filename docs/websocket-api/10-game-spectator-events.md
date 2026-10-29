# 오목 관전자 채팅·핑

2026-10-28 후속 보완 · S15P31B105-239. FE 요청 [관전자 채팅·핑 BE 연동 요청서](../../frontend/docs/OMOK_UX_BE_REQUEST.md), [BE 작업 명세](../omok-ux-be-spec.md)에 대한 **BE 확정 계약**이다. 플레이어 채팅 권한 보완을 포함한 서버 코드·로컬 WebSocket 통합 검사 범위이며, 개발 서버 배포와 FE 화면 공동 검수는 별도로 진행한다.

진행 중인 오목의 인증된 플레이어와 승인 관전자가 같은 경기의 플레이어·승인 관전자에게 채팅을 보낸다. 판 위치 추천(핑)은 관전자만 보낸다. 기존 메시지 이름·인증 `/ws/tables`·공통 envelope를 유지한다. 관전자의 `GAME_WATCH` 승인과 채널·20m·로비 검사는 그대로다. DB·Flyway 및 오목 판·차례·타이머·승패·정산은 바꾸지 않는다.

| 기능 | 메시지 | 방향 |
| --- | --- | --- |
| 관전 채팅 보내기 | GAME_SPECTATOR_CHAT_SEND | 클라이언트 → 서버 |
| 관전 채팅 승인·전달 | GAME_SPECTATOR_CHAT_MESSAGE | 서버 → 클라이언트 |
| 관전 핑 보내기 | OMOK_SPECTATOR_PING_SEND | 클라이언트 → 서버 |
| 관전 핑 승인·전달 | OMOK_SPECTATOR_PING | 서버 → 클라이언트 |

## 권한과 수신 범위

- **플레이어 채팅**: 해당 경기의 복구가 완료된 현재 인증 연결이며, 현재 좌석·경기 참가자와 일치하고 `PLAYER`의 `GAME_STATE`를 받은 사용자는 차례와 무관하게 `GAME_SPECTATOR_CHAT_SEND`를 보낼 수 있다. 플레이어의 핑은 `GAME_SPECTATOR_ACCESS_DENIED`다.
- **관전자 채팅·핑**: 해당 `gameId`로 `GAME_WATCH`를 요청해 **첫 `GAME_STATE`까지 받은** 인증 회원 관전자는 보낼 수 있다. 발신 시점에 다음을 모두 다시 검사한다.
  - 같은 채널, 테이블 중심 20m 이내
  - 미착석, 로비 자격(`canUseLobby`)
  - 해당 경기 참가자가 아님
- **발신 불가**:
  - `TABLE_WATCH`만 한 사용자, 근처에 서 있기만 한 사용자
  - 관전 요청 후 첫 상태를 받기 전인 사용자
  - 다른 경기 관전자, 현재 경기가 아닌 플레이어, 복구 전·퇴장한 연결
  - 임시 개발 연결(`accountId` 없음)
  - 향후 게스트 연결도 이 계약에서는 관전 수신만 허용하고 발신을 허용하지 않는다.
- **신원**: 발신자 ID·역할은 서버 연결에서만 정한다. payload의 `userId`·`role`·`senderUserId` 같은 추가 필드는 `INVALID_PAYLOAD`다. 플레이어도 기존 eventId 중복 처리·전송 간격·TTL·경기별 상한을 동일하게 적용받는다.
- **수신 대상**(채팅·핑 공통): 다음 두 집단이며, 승인 시점에 한 번 계산한다.
  - 해당 경기의 두 플레이어: 복구가 끝난 현재 연결(`GAME_CONNECTION_STATE`가 `RESTORED`)
  - 같은 `gameId`의 승인 관전자 전원
- 일반 광장 채팅(`WORLD_CHAT_SEND`/`WORLD_CHAT_MESSAGE`)과 type·gameId로 완전히 분리한다. 광장 채팅은 플레이어에게 중계하지 않고, 관전 채팅은 근처 사용자에게 보내지 않는다.
- 다른 경기·다른 채널·`TABLE_WATCH`만 한 사용자·관전 해제한 사용자는 받지 않는다.
- 현재는 `publicState.gameCode == "OMOK"`이고 `status == "PLAYING"`인 경기에서만 동작한다. 채팅 메시지 이름은 공통형이지만 다른 게임에 자동 적용하지 않는다.

## 승인 확인(ACK)과 전달

- 승인되면 발신자는 **원래 requestId가 담긴 같은 type 이벤트 1건**을 받는다. 다른 수신자는 `requestId=null`로 1건을 받는다. 기존 `WORLD_CHAT_MESSAGE`와 같은 방식이다.
- 발신자 확인은 일반 응답으로 큐에 넣는다. 다른 수신자 전달은 **비필수 이벤트**다.
  - 수신자의 송신 큐(128)에 여유가 32 이하이면 그 이벤트만 버리고 연결은 유지한다.
  - 송신 차례에 이미 만료됐어도 보내지 않는다.
  - 경기 상태·착수 결과·타이머·결과 이벤트는 기존 전송 정책 그대로이며, 관전 이벤트 때문에 연결이 끊기지 않는다.
- 따라서 **ACK는 "서버가 승인하고 전달을 시도했다"는 뜻이지, 모든 수신자 화면 도착을 보장하지 않는다.** 서버는 이력을 남기거나 재전송하지 않는다.
- 거절은 그 요청의 `ERROR` 1건뿐이며 방송·쿨다운·중복 기록을 남기지 않는다.

## 필드

| 필드 | 타입·규칙 |
| --- | --- |
| requestId | 기존 공통 규칙: 문자열 1~64자, 필수 |
| gameId | 문자열 1~120자. `TABLE_WATCH_STATE.gameId`·`GAME_WATCH`와 같은 값 |
| eventId | 클라이언트가 만든 소문자 정규 UUID `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`(`crypto.randomUUID()`). 대문자·중괄호는 거절 |
| text | 기존 `ChatText`: 앞뒤 공백 제거 후 1~200 코드포인트, 제어문자·U+2028/2029·단독 surrogate 거절. 서버는 정리한 원문을 그대로 전달하고 FE가 일반 텍스트로 표시한다 |
| basedOnVersion | 정수 0~9007199254740991. 관전자가 화면에 표시 중인 `GAME_STATE.version` |
| x, y | 정수 0~14. `x=열`, `y=행`, `board[y][x]`. `7.0`·`1e1`·문자열·범위 밖은 거절 |
| senderUserId | 문자열 10진 계정 ID(`CONNECTED.userId`, `publicState.blackUserId`와 같은 형식) |
| sentAt | Unix ms 숫자. 서버 승인 시각 |
| expiresAt | Unix ms 숫자. `sentAt + TTL`(채팅 3000, 핑 2000) |
| serverNow | Unix ms 숫자. 이 메시지를 만든 서버 시각(`WORLD_TIME_STATE.serverNow`와 같은 시계) |

## 관전 채팅 보내기 · GAME_SPECTATOR_CHAT_SEND

```json
{
  "requestId": "spectator-chat-1",
  "type": "GAME_SPECTATOR_CHAT_SEND",
  "payload": {
    "gameId": "41",
    "eventId": "2d895dfa-3ffb-4bd8-92ca-5c9e3bf8921b",
    "text": "가운데 쪽을 막아봐요!"
  }
}
```

발신자 ACK:

```json
{
  "requestId": "spectator-chat-1",
  "type": "GAME_SPECTATOR_CHAT_MESSAGE",
  "payload": {
    "gameId": "41",
    "eventId": "2d895dfa-3ffb-4bd8-92ca-5c9e3bf8921b",
    "senderUserId": "505",
    "text": "가운데 쪽을 막아봐요!",
    "sentAt": 1793062800120,
    "expiresAt": 1793062803120,
    "serverNow": 1793062800120
  }
}
```

두 플레이어·다른 승인 관전자에게는 위와 같은 payload를 `"requestId": null`로 보낸다.

오류 예시:

```json
{
  "requestId": "spectator-chat-2",
  "type": "ERROR",
  "payload": { "code": "GAME_SPECTATOR_CHAT_TOO_FREQUENT", "message": "관전 이벤트 전송 간격을 확인해주세요." }
}
```

## 관전 핑 보내기 · OMOK_SPECTATOR_PING_SEND

```json
{
  "requestId": "spectator-ping-1",
  "type": "OMOK_SPECTATOR_PING_SEND",
  "payload": {
    "gameId": "41",
    "eventId": "ee46b20f-e2b9-40ee-9a73-7a86c59e65a2",
    "basedOnVersion": 8,
    "x": 7,
    "y": 7
  }
}
```

전달(다른 수신자, 발신자는 같은 payload에 원래 requestId):

```json
{
  "requestId": null,
  "type": "OMOK_SPECTATOR_PING",
  "payload": {
    "gameId": "41",
    "eventId": "ee46b20f-e2b9-40ee-9a73-7a86c59e65a2",
    "senderUserId": "505",
    "basedOnVersion": 8,
    "x": 7,
    "y": 7,
    "sentAt": 1793062800120,
    "expiresAt": 1793062802120,
    "serverNow": 1793062800120
  }
}
```

같은 내용 재요청의 확인. 새 requestId를 쓰고 원래 sentAt/expiresAt을 유지하며, 방송하지 않는다:

```json
{
  "requestId": "spectator-ping-1-retry",
  "type": "OMOK_SPECTATOR_PING",
  "payload": {
    "gameId": "41",
    "eventId": "ee46b20f-e2b9-40ee-9a73-7a86c59e65a2",
    "senderUserId": "505",
    "basedOnVersion": 8,
    "x": 7,
    "y": 7,
    "sentAt": 1793062800120,
    "expiresAt": 1793062802120,
    "serverNow": 1793062800900
  }
}
```

```json
{
  "requestId": "spectator-ping-2",
  "type": "ERROR",
  "payload": { "code": "OMOK_SPECTATOR_PING_STALE_VERSION", "message": "최신 판 상태에서 다시 추천해주세요." }
}
```

핑은 위치 추천일 뿐 착수가 아니다. 돌이 있는 교차점도 허용하고 금수 판정을 하지 않는다. `GAME_ACTION_SEND`·`GAME_ACTION_RESULT`·`GAME_STATE`를 만들지 않는다.

## 검증 순서와 오류 코드

검증 순서는 다음과 같고, 앞에서 실패하면 그 오류를 돌려준다.

1. 공통·payload 형식
2. 맵 확인(`MAP_VERSION_REQUIRED`)
3. 인증 연결
4. 관전 자격
5. 오목 여부, 진행 중 여부
6. eventId 중복(같은 내용이면 ACK로 끝, 빈도 미소비)
7. 핑 버전
8. 사용자별 간격, 경기별 상한
9. 승인·전달

새 type은 `GAME_ACTION_SEND`처럼 로비 복구 게이트 앞에서 처리한다. 진행 중 플레이어도 `GAME_RECOVERY_REQUIRED` 대신 관전 권한 오류를 받는다.

| code | 조건 | FE 처리 |
| --- | --- | --- |
| INVALID_MESSAGE | 루트·requestId·type·payload 공통 형식 오류 | 요청 생성 코드 수정 |
| INVALID_PAYLOAD | 필드 누락·추가, gameId 빈값·120자 초과, eventId 형식, ChatText 실패, basedOnVersion·x·y 타입·범위 | 입력 수정, 재시도 안 함 |
| MAP_VERSION_REQUIRED | 기존 맵 확인 전 | 기존 처리 |
| GAME_SPECTATOR_AUTH_REQUIRED | 인증 회원이 아닌 연결 | 인증 연결 사용 |
| GAME_SPECTATOR_NOT_CONFIGURED | 경기 상태·복구 연결이 없는 서버 구성 | 기능 비활성 |
| GAME_SPECTATOR_ACCESS_DENIED | 다음 중 하나:<br>- 승인된 `GAME_WATCH` 없음(첫 상태 전, 해제됨, 다른 gameId)<br>- 채널·20m·착석·로비 자격 실패<br>- 요청자가 해당 경기 플레이어 | 입력 UI 닫기, 관전 상태 재확인 |
| GAME_SPECTATOR_UNSUPPORTED_GAME | 관전 중 경기가 오목이 아님 | 입력 숨김 |
| GAME_SPECTATOR_GAME_NOT_PLAYING | 관전자에게 마지막으로 전달한 상태가 `FINISHED` | 입력 종료 |
| GAME_SPECTATOR_EVENT_ID_CONFLICT | 같은 발신자·eventId로 종류·gameId·내용(text 또는 basedOnVersion·x·y)이 다른 요청 | 새 eventId로 새 요청 |
| GAME_SPECTATOR_EVENT_EXPIRED | 같은 발신자·eventId·내용이지만 원래 expiresAt이 지남 | 재생하지 않음 |
| OMOK_SPECTATOR_PING_STALE_VERSION | basedOnVersion이 그 관전자에게 마지막으로 전달한 버전과 다름. 또는 더 새 버전 변경 알림을 서버가 이미 받음 | 최신 GAME_STATE 표시 후 다시 클릭 |
| GAME_SPECTATOR_CHAT_TOO_FREQUENT | 같은 사용자 채팅 1초 미만, 또는 경기 전체 채팅 3초에 3건 초과 | 자동 재시도 안 함 |
| OMOK_SPECTATOR_PING_TOO_FREQUENT | 같은 사용자 핑 1초 미만, 또는 경기 전체 핑 2초에 5건 초과 | 자동 재시도 안 함 |
| INTERNAL_ERROR | 예상하지 못한 서버 오류 | 오류 표시, 재시도 안 함 |

## 중복·빈도·수명

| 항목 | 값 | 설정 키(`ontop.games.spectator-events.*`) |
| --- | --- | --- |
| 채팅 TTL | 3000ms | `chat-ttl=3s` |
| 핑 TTL | 2000ms | `ping-ttl=2s` |
| 사용자별 종류별 최소 간격 | 1000ms(승인된 요청만 기록) | `minimum-interval=1s` |
| 경기별 채팅 상한 | 3초에 3건 | `chat-game-limit=3`, `chat-game-window=3s` |
| 경기별 핑 상한 | 2초에 5건 | `ping-game-limit=5`, `ping-game-window=2s` |
| 중복 판정 | (인증 발신자, eventId), 30초, 사용자당 최대 64건 | `dedupe-retention=30s`, `dedupe-max-per-user=64` |

- 같은 eventId·같은 내용이 수명 안에 다시 오면 원래 sentAt/expiresAt으로 요청자에게만 다시 확인하고 재방송하지 않는다. 수명이 지났으면 `GAME_SPECTATOR_EVENT_EXPIRED`, 내용이 다르면 `GAME_SPECTATOR_EVENT_ID_CONFLICT`다.
- 중복 기록은 연결 종료·관전 해제로 지우지 않는다. 30초 안에 재접속해 같은 eventId를 보내도 다시 방송되지 않는다. 서버 재시작 시에는 메모리 기록이 비워진다.
- 경기별 상한은 FE의 동시 표시 수(채팅 3, 핑 5)와 같다. 관전자가 많아도 플레이어 수신량이 초당 약 3.5건으로 제한된다.
- 서버는 채팅·핑을 저장하거나 `GAME_STATE`·복구 상태에 넣지 않는다. 재관전·재접속 시 과거 이벤트를 재생하지 않는다.

## 판 버전과 착수 경합

- 승인 조건: `basedOnVersion ==` 그 관전자에게 마지막으로 전달한 `GAME_STATE.version`이고, 서버가 그보다 새 버전 변경 알림을 아직 받지 않았어야 한다. Hub 잠금이 경기 상태 변경 알림과의 경계다. 엔진은 호출하지 않는다.
- 엔진이 착수를 확정한 직후 변경 알림이 Hub에 도착하기 전의 짧은 구간에는 한 버전 이전 핑이 승인될 수 있다. 핑은 `GAME_STATE`와 전달 순서가 보장되지 않는다.
- 따라서 **FE는 현재 표시 중인 판 버전과 `basedOnVersion`이 같은 핑만 표시한다.**
  - 낮은 버전의 핑은 버린다.
  - 판 버전이 바뀌면 표시 중인 핑을 제거한다.
  - 높은 버전 핑은 같은 버전 상태가 도착할 때까지 expiresAt 안에서만 짧게 보관한다.

## FE 수신 처리와 시각

- `gameId`가 현재 경기와 다르면 버린다. 이미 처리한 eventId도 버린다. 발신자는 ACK를 받았을 때 한 번만 표시한다.
- 잔여 수명은 `expiresAt - serverNow`로 계산하고, 수신 시점부터 브라우저 단조 시계로 소멸시킨다. PC 시계로 계산하거나 수신할 때마다 TTL 전체를 새로 주지 않는다.
- 이미 만료됐으면 표시하지 않는다. F1·탭 숨김 후에도 만료된 이벤트를 한꺼번에 재생하지 않는다.
- 다음 상황에서는 표시 중인 이벤트와 범위 키를 정리한다. 서버는 이후 새 이벤트를 보내지 않는다.
  - `GAME_WATCH_LEFT`, `FINISHED`, 채널 이동, 재접속, 다음 판 gameId
- 자동 재시도는 하지 않는다. 연결 문제로 수동 재시도할 때만 같은 eventId·같은 내용을 다시 보낸다.

## 수명주기

| 사건 | 서버 동작 |
| --- | --- |
| 관전 해제(`GAME_UNWATCH`)·20m 이탈·채널 퇴장·착석 | 관전 구독이 제거되어 발신은 `GAME_SPECTATOR_ACCESS_DENIED`, 이후 수신 대상에서도 제외 |
| 경기 종료(5목·시간패·기권) | 새 버전이 전달되기 전의 핑은 STALE, 전달 후 채팅·핑은 `GAME_SPECTATOR_GAME_NOT_PLAYING` |
| 다음 판 | 새 gameId. 이전 구독으로는 보낼 수 없으며 FE는 UNWATCH 후 새 ID로 WATCH |
| 연결 종료·재접속 | 구독 소멸. 자동 재구독·재생 없음. 중복 기록은 30초 유지 |
| 큐 포화·만료 | 다른 수신자 전달만 버린다. 연결·필수 이벤트는 유지 |

## 구현 위치

| 파일 | 역할 |
| --- | --- |
| `backend/.../table/dto/TableProtocol.java` | 두 요청의 필드·UUID·ChatText·좌표·버전 검증 |
| `backend/.../table/service/SpectatorEventPolicy.java` | 중복·사용자 간격·경기별 상한·TTL. 메모리만 사용 |
| `backend/.../table/service/TableHub.java` | 승인 관전자 판정(`approvedSpectator`), 발신 처리(`sendSpectatorEvent`), 수신 대상 계산. 관전 상태 전달 때 gameCode·status·참가자를 기억 |
| `backend/.../table/websocket/TablePeer.java` | `offerTransient`: 비필수 이벤트의 큐 여유 32 예약·만료 폐기 |
| `backend/.../table/dto/GameSpectatorChatMessage.java`, `OmokSpectatorPing.java` | 전달 payload |

## 검증

- 단위:
  - `SpectatorEventProtocolTests`: 좌표 0/14 경계, 실수·문자열, 버전 범위, 위조 필드, UUID, ChatText
  - `SpectatorEventPolicyTests`: TTL, 중복·충돌·만료, 간격·거절 미기록, 경기별 상한, 64건 상한
  - `TablePeerTransientTests`: 큐 여유 32 예약, 만료 폐기, 필수 전송·연결 유지
- WebSocket 통합 `OmokSpectatorEventFlowTests`: 실제 티켓 인증 → 확정 시작 → 오목 엔진 → GAME_WATCH. 예약·정산 저장은 대역이다.
  - 플레이어 2명 + 승인 관전자 2명 수신, 발신자 ACK 1건
  - 다른 경기 플레이어·관전자, `TABLE_WATCH`만 한 사용자, 다른 채널 사용자 미수신·발신 거절
  - 플레이어 발신 거절, 착수 후 버전 경합(STALE)
  - 기권 종료 후 차단, 정산 대역 SETTLED 후 테이블 WAITING 복귀
  - 관전자 6명으로 경기별 상한, 만료 재요청, 거리 이탈·관전 해제·채널 이동·재접속 차단과 재방송 없음
  - 29초 시점 채팅·핑 후에도 마감·moveCount·version 불변, 30초 시간패 정상

## FE 공동 검수 절차(플레이어 2명 + 관전자 2명 이상)

1. 개발 서버에서 인증 계정 4개 이상이 같은 채널에 들어간다. 두 명이 태블릿 흐름(진입 → 선택 → 준비 → 방장 시작)으로 오목을 시작한다.
2. 관전자 2명 이상이 테이블 20m 안에서 `TABLE_WATCH_STATE.gameId`로 `GAME_WATCH`해 첫 `GAME_STATE`를 받는다.
3. 관전자 A가 채팅을 보낸다.
   - 두 플레이어와 관전자 B 화면에 3초 표시되는지 확인한다.
   - A는 ACK로 한 번만 표시되는지 확인한다.
   - 근처의 비관전자·다른 테이블 사용자에게 보이지 않는지 확인한다.
4. 관전자 B가 모서리(0,0)·(14,14)와 중앙에 핑을 보낸다. 양쪽 좌석의 플레이어와 A가 같은 교차점에 2초 표시되는지 확인한다.
5. 핑 직후 플레이어가 착수한다. 이전 버전 핑이 사라지거나 표시되지 않는지, STALE 오류 후 새 버전으로 다시 핑이 되는지 확인한다.
6. 다음 각 경우에 발신이 막히고 새 이벤트가 오지 않는지 확인한다.
   - 플레이어의 채팅·핑
   - 연속 전송(1초 미만)
   - 관전 해제, 거리 이탈, 채널 이동, 새로고침 재접속
7. 채팅·핑을 쓰는 동안 기존 착수·30초 시간패·금수·기권·결과/정산·다음 판이 정상인지 확인한다. F1을 열어도 서버 시간이 흐르는지 확인한다.

## 제안 대비 변경점

- `sentAt`·`expiresAt`·`serverNow`는 제안의 ISO 문자열 대신 **Unix ms 숫자**로 확정했다. 기존 `WORLD_TIME_STATE.serverNow`와 같은 형식이다.
- 관전자끼리도 같은 경기 채팅을 받는다(제안 기본안 채택).
- 경기별 상한(채팅 3건/3초, 핑 5건/2초)과 비필수 이벤트 폐기 경로를 추가했다.
- 플레이어 발신 거절은 별도 코드 없이 `GAME_SPECTATOR_ACCESS_DENIED`로 통합했다.

---

[공통 규격](00-common.md) · [오류 응답](06-error.md) · [경기 통신](09-game-communication.md) · [API 목록](../websocket-api.md)
