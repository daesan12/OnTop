# 광장 채널 입장·퇴장

기존 Raw WebSocket `/ws/tables` 연결을 재사용한다. `local` 전용이며 별도 `/ws/world` 연결은 만들지 않는다. 기존 인증·중복 접속 차단·heartbeat·연결별 송신 순서를 그대로 사용한다.

기준은 [OnTop v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71)의 광장·실시간 통신과 [채널 목록 계약](channel-query-api.md)이다. 아래 메시지 이름·필드·버전은 이번 구현의 통신 계약이다. 이동·좌표·채팅은 후속 범위다. 채널 설정 시 채널별 테이블을 생성하고 해당 채널 입장 후에만 착석한다. [테이블 조회 계약](table-query-api.md)의 channelId 필터와 서버 발급 tableId를 사용한다. 채널 설정 없는 기존 개발 모드만 table-1·table-2를 유지한다.

## 입장

```json
{"requestId":"channel-join-1","type":"CHANNEL_JOIN","payload":{"channelId":"channel-1"}}
```

서버 설정에 있는 채널로만 입장한다. 사용자 ID는 기존 연결에서 찾으며 요청으로 보내지 않는다. 한 연결은 한 채널에만 참여한다. 다른 채널로 바꾸려면 먼저 `CHANNEL_LEAVE`를 보낸다. 기존 채널을 자동으로 옮기지 않는다.

성공하면 본인에게 원래 요청 ID의 `CHANNEL_STATE`, 같은 채널의 다른 참가자에게 `requestId=null`인 동일 상태를 보낸다.

```json
{
  "requestId":"channel-join-1",
  "type":"CHANNEL_STATE",
  "payload":{
    "channelId":"channel-1",
    "name":"검증 채널",
    "version":1,
    "capacity":3,
    "currentUsers":1,
    "userIds":["dev-example"]
  }
}
```

- 정원·이름·ID는 `ontop.world.channels` 설정을 사용한다. 예시 3명은 최종 정원이 아니다.
- `version`은 채널별로 0부터 시작해 실제 입장·퇴장 때 1 증가한다. 같은 채널 반복 입장은 본인에게 현재 상태만 응답하며 인원·버전·타인 알림은 바뀌지 않는다. 만석이어도 본인의 반복 입장은 성공한다.
- `userIds`는 현재 같은 채널 참가자의 서버 식별자이며 입장 순서다. 계정 프로필·토큰·다른 채널 참가자는 보내지 않는다. 기본 dev 모드와 인증 모드의 식별자 형식은 기존 `CONNECTED` 계약을 따른다.
- 채널 상태는 전체 스냅샷이다. 같은 채널의 낮은 버전은 무시하되 같은 버전의 직접 응답도 요청 완료 처리한다. 새 연결에서는 캐시를 비운다.
- 테이블 착석 중 채널 변경은 `TABLE_BUSY`다. 같은 채널의 반복 입장은 조회로 처리한다. 경기 복구가 대기 기능을 막는 인증 상태에서는 `GAME_RECOVERY_REQUIRED`가 먼저 적용된다.

## 퇴장

```json
{"requestId":"channel-leave-1","type":"CHANNEL_LEAVE","payload":{}}
```

```json
{"requestId":"channel-leave-1","type":"CHANNEL_LEFT","payload":{"channelId":"channel-1"}}
```

본인에게 `CHANNEL_LEFT`, 남은 사람에게 버전이 증가한 `CHANNEL_STATE`를 보낸다. 연결은 유지하며 다른 채널 입장이 가능하다. 퇴장한 연결에는 이전 채널의 후속 상태를 보내지 않는다. 이미 미입장이면 `NOT_IN_CHANNEL`이다. 착석 중에는 먼저 `TABLE_LEAVE`로 대기 좌석을 정리해야 한다.

## 끊김과 목록 조회

정상 종료·전송 실패·heartbeat 만료는 기존 `disconnect()`로 모이며 채널 인원을 즉시 제거한다. 같은 종료를 반복 처리해도 인원·버전을 중복 변경하지 않는다. 끊긴 본인에게 `CHANNEL_LEFT`를 보내지 않는다. 광장 입장 인원에 30초 예약을 두지 않는다. 실제 경기의 30초 복구 계약은 별도로 유지한다.

`GET /api/v1/channels`의 `currentUsers`와 `joinable`은 이 입장 상태를 읽는다. 조회는 여전히 서버 인증 Principal이 필요하며 소켓의 dev 모드가 HTTP 인증을 대신하지 않는다. 목록에 빈자리로 보여도 실제 입장 시 정원을 다시 검사한다.

기본 채널 설정은 빈 목록이다. 실제 로그인·게임 엔진 복구는 미연결이고 재시작하면 상태와 버전이 초기화된다. 채널별 대기·시작 검증 상태는 분리했지만 실제 경기 엔진을 연결한 것은 아니다.

## 오류

공통 `ERROR` 형식과 JSON 검증 순서를 유지한다. 오류는 요청자에게만 전송하며 기존 입장 상태를 유지한다.

| code | 조건 |
| --- | --- |
| `INVALID_PAYLOAD` | channelId 누락·빈 값·잘못된 타입·추가 필드 또는 빈 객체가 아닌 퇴장 payload |
| `CHANNEL_NOT_FOUND` | 등록되지 않은 채널 |
| `ALREADY_IN_CHANNEL` | 다른 채널에 이미 입장 |
| `CHANNEL_FULL` | 새 참가자를 받을 빈자리 없음 |
| `NOT_IN_CHANNEL` | 입장하지 않은 연결의 퇴장 요청 |
| `TABLE_BUSY` | 테이블 착석 중 채널 변경·퇴장 |
| `GAME_RECOVERY_REQUIRED` | 경기 복구 상태가 대기 기능을 막음 |

예상하지 못한 오류는 기존 `INTERNAL_ERROR`를 따른다. 오류 메시지 문자열보다 code로 분기한다.
