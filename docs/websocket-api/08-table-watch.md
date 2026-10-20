# 👀 착석 없이 테이블 상태 보기

`local`의 기존 `/ws/tables` 연결을 사용한다. OnTop v0.4의 탐색·관전을 위한 **공개 대기 상태 구독 기반**이다. 실제 경기 관전·손패·주사위·경기 세션·판돈 정보는 제공하지 않는다. 기존 개발 화면에는 구독 버튼이 없으며 프론트는 아래 메시지를 사용한다.

## 요청과 응답

```json
{"requestId":"watch-1","type":"TABLE_WATCH","payload":{"tableId":"서버 목록에서 받은 테이블 ID"}}
```

성공은 본인에게 같은 요청 ID의 `TABLE_WATCH_STATE`다. payload는 [TABLE_STATE](04-table-state.md)와 같은 공개 대기 스냅샷이다.

```json
{
  "requestId":"watch-1",
  "type":"TABLE_WATCH_STATE",
  "payload":{
    "tableId":"table-example",
    "version":2,
    "capacity":2,
    "minimumPlayers":2,
    "seats":[
      {"seatNumber":1,"userId":"dev-example","ready":false},
      {"seatNumber":2,"userId":null,"ready":false}
    ],
    "allReady":false,
    "selectorUserId":"dev-example",
    "gameCode":"OMOK"
  }
}
```

이후 해당 테이블의 착석·퇴장·선택·준비 변경은 구독자에게 `requestId:null`의 `TABLE_WATCH_STATE`로 전달한다. `TABLE_STATE`와 별도 캐시에 저장해 구독자를 착석자로 처리하지 않는다. 같은 테이블의 낮은 version은 무시하고, 같은 버전의 직접 응답도 요청 완료로 처리한다. `allReady`는 대기 참가자 준비 상태이며 실제 경기 시작 확인 응답이 아니다.

## 범위와 권한

- 미착석 사용자가 한 테이블을 구독한다. 채널 설정이 있으면 현재 입장한 채널의 테이블만 허용한다. 목록 조회와 같이 서버 발급 tableId를 사용한다. 채널 설정이 없는 기존 개발 모드도 지원한다.
- 같은 테이블 반복 구독은 본인에게 현재 상태만 응답한다. 다른 테이블을 보려면 먼저 구독을 종료한다. 테이블 정원과 무관하게 대기 상태를 볼 수 있으며 거리·관전 정원 정책은 이번에 정하지 않았다.
- 구독은 좌석·게임 선택권·준비·시작 참가자를 바꾸지 않는다. 구독만 한 상태의 선택·준비·시작 조회는 기존 미착석 오류를 따른다. 구독자에게 `GAME_START_STATE`나 경기 복구·비공개 상태를 추가 전송하지 않는다.
- 기존 서버 인증·추가 접속 거절·경기 복구 게이트·heartbeat를 재사용한다. 실제 로그인은 미연결이다.

## 구독 종료와 정리

```json
{"requestId":"stop-1","type":"TABLE_UNWATCH","payload":{}}
```

```json
{"requestId":"stop-1","type":"TABLE_WATCH_LEFT","payload":{"tableId":"table-example"}}
```

- 명시적 종료는 같은 requestId로 완료 응답한다. 종료 후 해당 테이블의 알림을 보내지 않는다. 이미 송신 큐에 들어간 이전 알림은 종료 응답보다 앞에 도착할 수 있으므로 종료 응답에서 캐시를 비운다.
- 성공한 `TABLE_JOIN`은 `requestId:null`의 `TABLE_WATCH_LEFT` 다음 기존 착석 응답을 보낸다. 착석 거절은 구독을 유지한다. 다른 테이블 착석도 성공해야 기존 구독을 정리한다.
- 성공한 `CHANNEL_LEAVE`는 `TABLE_WATCH_LEFT(null)` 다음 `CHANNEL_LEFT(요청 ID)`를 보낸다. 오류는 기존 구독을 유지한다.
- 연결 종료·heartbeat 종료는 구독을 제거하며 종료 알림을 보내지 않는다. 재접속은 새 구독이 필요하다. 앱 종료도 메모리를 정리한다.

## 오류

| code | 조건 |
| --- | --- |
| INVALID_PAYLOAD | tableId 누락·잘못된 타입·공백·추가 필드, 빈 객체가 아닌 종료 payload |
| TABLE_NOT_FOUND | 미등록 테이블 |
| NOT_IN_CHANNEL | 채널 설정 환경에서 미입장 |
| TABLE_CHANNEL_MISMATCH | 다른 채널의 테이블 |
| TABLE_BUSY | 착석 중 구독 요청 |
| ALREADY_WATCHING | 다른 테이블을 이미 구독 |
| NOT_WATCHING | 구독 없이 종료 요청 |
| GAME_RECOVERY_REQUIRED | 기존 인증 경기 복구 제한 |

테이블 존재 → 채널 → 착석 → 기존 구독 순으로 확인하며, 경기 복구 제한은 기존 공통 검사에서 먼저 적용한다. 실패는 요청자에게 기존 `ERROR` 형식으로 전달한다.

검증: `TableWatchHubTests`, `TableWatchWebSocketTests`, `TableProtocolTests`. 실제 경기 관전·운영 부하를 검증한 것은 아니다. 이 계약은 저장소에 반영했으며 Notion과 자동 동기화되지 않는다.
