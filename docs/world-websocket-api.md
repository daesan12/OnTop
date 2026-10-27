# 광장 WebSocket · 채널·이동·채팅

연결 시 실제 로딩한 맵 정보와 입장 전 확인은 [맵 버전 계약](world-map-api.md)을 사용한다.
버전 검사 활성화 시 WORLD_MAP_CONFIRM 성공 후 기존 CHANNEL_JOIN을 보낸다.

시설 이용·반납·망원경 방향·점유 복구는 [시설 점유 계약](world-facility-api.md)을 사용한다.
따라가기 시작·자동 이동·종료·관계 조회는 [따라가기 계약](world-follow-api.md)을 사용한다.
기권·패배의 참가자/주변 공개 연출은 [WORLD_GAME_REACTION 계약](world-game-reaction-api.md)을 사용한다.

기존 Raw WebSocket `/ws/tables` 연결을 재사용하며 별도 `/ws/world` 연결은 만들지 않는다. 인증은 기본 필수이고 비인증 개발 사용자는 명시적 local 환경에서만 허용한다. 비local의 WebSocket 기반 등록·Origin 검증·프로필 제한은 [현행 인증 계약](websocket-authentication.md#실행-조건)을 따른다. 기존 중복 접속 차단·heartbeat·연결별 송신 순서는 유지하며 상점 외형 조회 Gateway의 local·db 조건과 구분한다.

기준은 [OnTop v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71)의 광장·실시간 통신과 [채널 목록 계약](channel-query-api.md)이다. 아래 메시지 이름·필드·버전은 구현의 통신 계약이다. 같은 채널 위치 공유·채팅 송수신 기반을 구현했다. 채팅은 기본20m 근거리 필터와 서버 판정 위치를 사용한다. 채널 설정 시 채널별 테이블을 생성하고 해당 채널 입장 후에만 착석한다. [테이블 조회 계약](table-query-api.md)의 channelId 필터와 서버 발급 tableId를 사용한다. 채널 설정 없는 기존 개발 모드만 table-1·table-2를 유지한다.

## 입장

```json
{
  "requestId": "channel-join-1",
  "type": "CHANNEL_JOIN",
  "payload": {
    "channelId": "channel-1"
  }
}
```

서버 설정에 있는 채널로만 입장한다. 사용자 ID는 기존 연결에서 찾으며 요청으로 보내지 않는다. 한 연결은 한 채널에만 참여한다. 다른 채널로 바꾸려면 먼저 `CHANNEL_LEAVE`를 보낸다. 기존 채널을 자동으로 옮기지 않는다.

성공하면 본인에게 원래 요청 ID의 `CHANNEL_STATE`, 같은 채널의 다른 참가자에게 `requestId=null`인 동일 상태를 보낸다.

```json
{
  "requestId": "channel-join-1",
  "type": "CHANNEL_STATE",
  "payload": {
    "channelId": "channel-1",
    "name": "검증 채널",
    "version": 1,
    "capacity": 3,
    "currentUsers": 1,
    "userIds": ["dev-example"]
  }
}
```

- 정원·이름·ID는 `ontop.world.channels` 설정을 사용한다. 예시 3명은 최종 정원이 아니다.
- `version`은 채널별로 0부터 시작해 실제 입장·퇴장 때 1 증가한다. 같은 채널 반복 입장은 본인에게 현재 상태만 응답하며 인원·버전·타인 알림은 바뀌지 않는다. 만석이어도 본인의 반복 입장은 성공한다.
- `userIds`는 현재 같은 채널 참가자의 서버 식별자이며 입장 순서다. 계정 프로필·토큰·다른 채널 참가자는 보내지 않는다. 기본 dev 모드와 인증 모드의 식별자 형식은 기존 `CONNECTED` 계약을 따른다.
- 채널 상태는 전체 스냅샷이다. 같은 채널의 낮은 버전은 무시하되 같은 버전의 직접 응답도 요청 완료 처리한다. 새 연결에서는 캐시를 비운다.
- 테이블 착석 중 채널 변경은 `TABLE_BUSY`다. 같은 채널의 반복 입장은 조회로 처리한다. 경기 복구가 대기 기능을 막는 인증 상태에서는 `GAME_RECOVERY_REQUIRED`가 먼저 적용된다.
- 경기 종료·기권 후 정산 대기로 좌석이 보존된 회원이 다시 연결했다면, FINISHED/ELIMINATED 복구 확인 후 원래 테이블의 채널로 CHANNEL_JOIN할 수 있다. 다른 채널로의 이동은 TABLE_BUSY로 유지한다. 정원·채널 존재·중복 접속 검사는 생략하지 않는다.

## 퇴장

```json
{
  "requestId": "channel-leave-1",
  "type": "CHANNEL_LEAVE",
  "payload": {}
}
```

```json
{
  "requestId": "channel-leave-1",
  "type": "CHANNEL_LEFT",
  "payload": {
    "channelId": "channel-1"
  }
}
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
| `MOVE_TOO_FREQUENT` | 새 순번의 이동이 최소 전송 간격보다 빠름 |
| `CHAT_TOO_FREQUENT` | 채팅 전송이 사용자별 최소 간격보다 빠름 |

예상하지 못한 오류는 기존 `INTERNAL_ERROR`를 따른다. 오류 메시지 문자열보다 code로 분기한다.

## 광장 이동 · WORLD_MOVE / WORLD_STATE

2026-10-21 사용자 요청으로 **서버 입력 기반 이동**으로 전환했다. 기존 좌표 보고 payload는 호환하지 않으며 INVALID_PAYLOAD로 거절한다.

```json
{
  "requestId": "move-1",
  "type": "WORLD_MOVE",
  "payload": {
    "seq": 1,
    "dx": 0,
    "dz": -1,
    "run": false,
    "jump": false
  }
}
```

- seq: 채널 입장 기간 중1~4294967295 증가 정수. dx/dz: 각[-1,1] 유한 숫자, 대각선 길이가1을 넘으면 정규화. run은 boolean 필수, jump는 boolean 선택(기본false). 사용자·채널·시각·dt·최종 좌표·회전각은 보내지 않는다.
- 입장 시 서버가 스폰을 부여한다. m/Y-up이며 위치는 캐릭터 캡슐 중심이다. 본인 입력 확인은 원래 requestId의 WORLD_STATE이고 위치는 직전 계산 값일 수 있다. lastInputSeq는 마지막 **수락한** 입력 확인이며 해당 입력이 전부 시뮬레이션됐다는 뜻은 아니다.
- 서버가30Hz 고정 간격으로 계산하며 변화가 있으면 약100ms마다 같은 채널에 requestId=null의 전체 WORLD_STATE를 보낸다. 입력 빈도가 물리 계산 시간을 늘리지 않는다. 지연 시 최대3스텝만 보충하며 과도한 지연분은 버린다. 운영 처리량을 측정한 값은 아니다.
- 입력 최소 간격 기본50ms(ontop.world.movement.minimum-interval 설정), 새 입력이250ms 없으면 수평 이동 정지. 과거/중복 seq는 재적용·만료 연장 없이 최신 상태만 본인에게 응답한다. 너무 빠른 새 입력은 MOVE_TOO_FREQUENT이며 순번을 소비하지 않는다.
- 걷기6.25m/s·달리기9m/s·기본 점프6.2m/s·중력-18m/s²·추락 한도20m/s·자동 단차0.22m. 반지름0.30/중앙 선분 반높이0.48m 캡슐을 사용한다. 참조 여유0.02m는 맵 경계·발 위치 계산에 사용하며 Bullet 캡슐의 내부 margin은 Rapier skin과 별개다. 공중 재점프는 차단한다.
- 수령한 shared-config 전체를 bake한 park.json은 박스1,142개·메시4개(지형/팔각정 계단/전망대 경사로·데크·난간/팔각정 울타리)·팔각정 바닥 hull9개를 포함한다. 메시로 합친 박스를 중복 등록하지 않는다. 물리 엔진은 Java Minie9.0.3/Bullet이며 TypeScript/Rapier와 수치적으로 동일한 엔진은 아니다.
- 수영 속도·부력·징검다리 오르기·전망대 전용 점프는 전달 코드에 맞춰 처리한다. 전체3D 프론트 동작 동등성·Linux native·운영 부하 검증은 별도다. 생성/입력/계산/조회/제거를 채널별 전용 물리 thread에 모은다.
- 착석 중 TABLE_BUSY, 미입장 NOT_IN_CHANNEL, 경기 복구 제한 GAME_RECOVERY_REQUIRED. 착석 시 입력을 정리하고 몸체를 정지한다. 퇴장·heartbeat·연결 종료는 몸체/입력을 제거하며 재입장은 새 스폰·seq 초기화다. 경기30초 복구와 구분한다.

```json
{
  "requestId": null,
  "type": "WORLD_STATE",
  "payload": {
    "channelId": "channel-1",
    "version": 4,
    "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0",
    "avatars": [
      {
        "userId": "101",
        "nickname": "산책자",
        "characterGender": "MALE",
        "position": {
          "lastInputSeq": 1,
          "x": -2.025,
          "y": 0.84,
          "z": 34,
          "yaw": 3.141592653589793,
          "moving": false,
          "running": false,
          "swimming": false
        },
        "equipment": [
          {
            "itemId": 1,
            "itemCode": "RED_TOP",
            "equipSlot": "TOP",
            "imageKey": "demo-red-top"
          }
        ]
      }
    ]
  }
}
```

맵 밖 스폰을 막기 위해 제공 맵의 검증된16개 스폰 영역을 순환한다(아바타 간 충돌 제외). mapVersion은 수령 manifest의 SHA-256이며 위치·상품은 예시다. avatars는 입장 순서, version은 입퇴장·입력수락·위치/모션·장착 외형 변화 시 증가하며 CHANNEL_STATE와 비교하지 않는다. 동일 채널의 낮은 버전은 무시하고 연결/채널 변경 시 캐시를 비운다. 프론트는 같은 맵 버전을 사용해 보간·서버 위치 보정을 담당한다. 기존 Colyseus adapter를 자동 변환한 것은 아니다. 채팅·관전20m는 이 서버 위치를 읽으며 테이블 좌표는 기존 서버 설정을 유지한다.

### 공개 프로필 동기화

- `avatars[].nickname`, `avatars[].characterGender`는 DB 회원의 공개 표시 정보다. `characterGender`는 실제 성별이 아닌 캐릭터 외형 구분 `MALE`/`FEMALE`다. 이메일·소셜 식별자·인증정보는 전송하지 않는다.
- `db` 프로필에서 채널 입장/재입장 직후 비동기로 조회하고, 접속 중인 회원은 5초마다 일괄 재조회한다. 닉네임 변경은 다음 조회 완료 뒤 같은 채널의 `WORLD_STATE`에 반영된다. 이동 tick마다 DB를 읽지 않는다.
- 최초 조회 전이나 DB 없는 개발 사용자에는 두 값이 `null`이다. 조회 장애 때 이미 확인된 표시를 지우지 않는다. 프론트는 `null`을 임의의 남성 외형/닉네임 덮어쓰기로 처리하지 않는다.
- 퇴장·단절 뒤 캐시를 제거하고 재입장 시 다시 읽는다. 이전 연결/채널의 늦은 조회 결과는 적용하지 않는다. 공개 프로필은 요청으로 설정할 수 없다.
- 기존 `equipment`, 위치, 버전 계약은 유지한다. 프론트는 `MALE`→기존 `man`, `FEMALE`→기존 `girl` 표시 값으로 매핑한다. FE 실제 연결·렌더링 완료와 백엔드 검증은 구분한다.

### 의상 변경 동기화

- INVENTORY-02 장착 REST의 실제 커밋 뒤 같은 채널 본인·다른 참가자에게 갱신 WORLD_STATE(requestId=null)를 전송한다. 롤백·다른 채널은 알리지 않는다. 기존 REST 응답·소켓 메시지 이름은 유지한다.
- `avatars[].equipment`는 공개 `{itemId,itemCode,equipSlot,imageKey}` 배열이며 최대5개·부위당 하나다. 가격·수량·보유 ID는 포함하지 않는다. DB가 보유·부위를 판정하며 클라이언트 외형/좌표 입력은 허용하지 않는다.
- `null`은 미조회·기능 비활성·최초 조회 실패라서 기존 외형을 지우지 않는다. `[]`는 조회 성공·장착 없음이다. 기존 캐시가 있으면 조회 실패 시 마지막 외형을 보존한다.
- 최초·반복 CHANNEL_JOIN과 재접속 후 CHANNEL_JOIN 때 최신 장착을 비동기 조회한다. 입장 초기 상태는 null일 수 있다. 읽기는 Hub 잠금 밖의 별도 트랜잭션으로 수행하고 이동 tick은 캐시를 재사용한다. 이전 요청·연결·채널의 늦은 결과는 버린다. 퇴장·끊김은 캐시를 정리한다.
- 상점 활성(local,db + ontop.shop.enabled=true) 조건이 필요하다. 실제 imageKey→3D 에셋 및 기본 외형 매핑·렌더링은 프론트와 협의한다. 테스트 JSON의 상품은 실제 에셋 확정값이 아니다.
- WorldAppearanceFlowTests는 지연 조회·최신 요청·채널 변경·실패 캐시·주입 거절, WorldAppearanceMySqlTests는 실제 JWT/티켓/소켓·장착 REST·같은 채널 전파·롤백·재접속을 검증한다. 운영/실제 3D 프론트 연동 성공을 의미하지 않는다.

변경 맵을 재생성할 때는 Node24에서 `node --experimental-vm-modules backend/tools/bake-world.mjs <handoff-directory>`를 실행한다. shared-config28개 모듈을 제한된 VM에서 읽고 원본 manifest의 크기/해시를 대조한다. Node/TypeScript는 서버 실행 의존성이 아니다.

검증 진입점은 WorldPhysicsTests(실제 맵), WorldMovementWebSocketTests(실제 임시 서버/소켓), WorldProximityWebSocketTests(서버 위치를 주입한 거리 계약 fixture)다. 거리 테스트의 고정 위치를 클라이언트 순간이동 구현으로 해석하지 않는다.

## 채널 채팅 기반 · WORLD_CHAT_SEND / WORLD_CHAT_MESSAGE

현재 local 계약은 발신자 기준 같은 채널의 XZ 반경 20m 이내 전달이다. 채널 입장 시 서버 스폰을 부여한다. 방어적으로 위치가 없으면 WORLD_POSITION_REQUIRED다. [근거리 설정·관전 계약](world-proximity.md)을 함께 따른다.

```json
{
  "requestId": "chat-1",
  "type": "WORLD_CHAT_SEND",
  "payload": {
    "text": "안녕 👋"
  }
}
```

```json
{
  "requestId": "chat-1",
  "type": "WORLD_CHAT_MESSAGE",
  "payload": {
    "messageId": "00000000-0000-4000-8000-000000000001",
    "channelId": "channel-1",
    "userId": "dev-example",
    "text": "안녕 👋",
    "sentAt": "2026-10-20T00:00:00Z"
  }
}
```

- 성공은 본인에게 원래 requestId의 WORLD_CHAT_MESSAGE, 같은 채널에서 위치가 확인되고 발신자 반경 20m 이내인 나머지 참가자에게 requestId=null인 같은 payload를 보낸다. 별도 ACK는 없다. 미입장·다른 채널·위치 미보고·범위 밖 타인에게 전달하지 않는다. 대기 착석자는 서버가 유지한 위치로 이용한다.
- `userId`는 서버 연결의 내부 ID, `messageId`는 서버 발급 UUID, `sentAt`은 서버 UTC 시각이다. 닉네임·프로필 연동은 아직 없다. 클라이언트가 userId/channelId/messageId/시각을 payload에 넣으면 INVALID_PAYLOAD다.
- `text`는 문자열 하나만 허용한다. 앞뒤 공백을 제거한 1~200 Unicode 코드포인트이며 이모지 하나는 코드포인트 기준으로 센다. 조합 이모지는 여러 코드포인트일 수 있다. 빈 문자열·공백만·초과·개행/탭/제어문자·U+2028/U+2029 줄 구분 문자·짝 없는 surrogate는 INVALID_PAYLOAD다. HTML 같은 문자열은 일반 텍스트로 보존하므로 프론트는 textContent 등 텍스트 렌더링을 사용하며 HTML로 삽입하지 않는다.
- 기본 최소 전송 간격은 사용자별 1초다. `ontop.world.chat.minimum-interval`로 0 초과~60초 이하를 설정한다. 빠른 재전송은 CHAT_TOO_FREQUENT이며 메시지를 전달하거나 마지막 성공 시간을 연장하지 않는다. 채널 이동·퇴장·재입장으로 간격을 초기화하지 않는다. 연결 종료·heartbeat·앱 종료에서는 관련 메모리를 정리한다.
- 간격 제한은 현재 연결 수명 기준의 기초 도배 방지다. 재접속 이후까지 지속되는 계정 제재·욕설 판정·감정 분석은 미구현이다. 설정값은 성능 실측이나 최종 제품 정책으로 정한 값이 아니다.
- 미입장은 NOT_IN_CHANNEL이다. 기존 인증 경기 복구 제한은 GAME_RECOVERY_REQUIRED로 유지한다. 실제 경기 중 채팅 정책을 새로 확정하거나 복구 게이트를 우회하지 않는다.
- 보관·이력 조회·재접속 재전송은 없다. 전달된 메시지는 수신 순서로 처리하고 sentAt으로 서버 순서를 다시 정렬하지 않는다. requestId는 멱등성 키가 아니므로 자동 재시도하면 간격 이후 중복 채팅이 생길 수 있다. 새 연결에는 과거 메시지를 보내지 않는다.
- 이동·준비·채널 인원·위치 버전은 채팅으로 변경하지 않는다. 채팅 본문을 서버 로그에 남기지 않는다.

`WorldChatTests`는 입력·간격·서버 메타데이터·정리를, `WorldChatHubTests`는 실제 송신 큐의 채널 격리·착석 중 사용·이동 후 제한을, `WorldChatWebSocketTests`는 인증 대역의 실제 소켓·heartbeat 후 정리를 검사한다. 실제 채팅 화면·정식 로그인·운영 검증은 포함하지 않는다. 거리 검증은 WorldProximityTests/WebSocketTests에서 수행한다.

## 감정표현 전송 기반 · WORLD_EMOTE_SEND / WORLD_EMOTE_EVENT

서버의 `ontop.world.emote.codes`에 등록한 코드만 허용한다. local/dev(운영 혼합 제외)는 WAVE·CLAP·APPLAUSE_REQUEST·TSK·FART 5종을 기본 등록하며 `WORLD_EMOTE_CODES`로 재정의할 수 있다. 운영 기본 목록은 비어 있어 배포 설정에서 명시 등록해야 한다. visual-test는 기존 WAVE/CLAP 검증 설정을 유지한다. 실제 3D 애니메이션 연결·운영 배포 완료를 뜻하지 않는다.

| FE 표현 ID | 서버 코드 | 표시 | 다음 사용까지 |
| --- | --- | --- | --- |
| EMOTE_WAVE | WAVE | 손 인사 | 5초 |
| EMOTE_CLAP | CLAP | 박수 | 5초 |
| EMOTE_APPLAUSE_REQUEST | APPLAUSE_REQUEST | 박수 부탁 | 1.8초 |
| EMOTE_TSK | TSK | 에잉 쯧쯧 | 1.8초 |
| EMOTE_FART | FART | 방귀 | 1.8초 |

2026-10-24 사용자 확정: 프론트 catalog/config 기준의 표현별 간격을 서버에도 적용한다. 직전에 성공한 표현의 간격 동안 다른 표현도 사용할 수 없으며 채널 이동·거절 요청으로 시간을 우회/연장하지 않는다. 서버의 `ontop.world.emote.minimum-interval`을 더 길게 지정하면 더 긴 값이 우선한다.

2026-10-25 사용자·FE 확정: 가만히 서 있을 때만 일반 감정표현을 허용한다. 이동·점프 중 공중 상태·수영·테이블 착석(대기 포함)·벤치·운동기구·망원경 이용 중은 `EMOTE_ACTIVITY_CONFLICT`다. 실제 경기 복구 게이트의 `GAME_RECOVERY_REQUIRED`는 우선 적용한다. 물리 tick 전에 수락한 이동·점프 입력도 검사한다. 관전 자체는 차단하지 않지만 같은 활동 조건을 적용한다. 선택 UI·아바타 모션은 프론트가 맡는다.

```json
{
  "requestId": "emote-1",
  "type": "WORLD_EMOTE_SEND",
  "payload": {
    "emoteCode": "WAVE"
  }
}
```

```json
{
  "requestId": "emote-1",
  "type": "WORLD_EMOTE_EVENT",
  "payload": {
    "eventId": "00000000-0000-4000-8000-000000000001",
    "channelId": "channel-1",
    "userId": "dev-example",
    "emoteCode": "WAVE",
    "sentAt": "2026-10-20T00:00:00Z"
  }
}
```

- 요청은 `emoteCode` 하나만 받는다. 대문자 영문으로 시작하고 대문자·숫자·밑줄로 된 1~32자다. 공백 정리·대소문자 변환을 하지 않는다. 잘못된 형식/추가 필드는 INVALID_PAYLOAD, 문법은 맞지만 서버에 미등록된 코드는 EMOTE_NOT_SUPPORTED다. 잘못된 서버 설정·중복 코드는 앱 시작 시 거절한다.
- 서버 연결에서 사용자와 현재 채널을 확인한다. 성공은 본인에게 같은 requestId의 WORLD_EMOTE_EVENT, 같은 채널의 다른 참가자에게 requestId=null의 같은 payload를 보낸다. 다른 채널·미입장 연결에 보내지 않는다. 좌표 기반 근거리 필터는 포함하지 않는다.
- eventId(UUID)와 sentAt(UTC)은 서버가 생성한다. 프론트는 등록한 코드와 아바타 모션을 매핑한다. 아직 없는 모션을 임의 재생하거나 emoteCode를 HTML/동적 코드로 실행하지 않는다. 실제 모션 매핑/카탈로그 조회는 이번 구현에 없다.
- 사용자별로 직전 표현의 간격(위 표)을 적용한다. 추가 최소 간격 `ontop.world.emote.minimum-interval`의 기본 1초보다 표현별 간격이 우선하며 더 엄격한 설정만 덧붙인다. 빠르면 EMOTE_TOO_FREQUENT, 미등록/거절은 마지막 성공 시각을 연장하지 않는다. 다른 표현·채널로 바꿔도 연결의 제한은 유지한다. 채팅 간격과 별도로 관리한다.
- 감정표현은 좌석·준비·선택권·인원·위치 버전을 바꾸지 않는다. 미입장은 NOT_IN_CHANNEL, 위치가 없으면 WORLD_POSITION_REQUIRED, 이동/수영/테이블·시설 이용 중은 EMOTE_ACTIVITY_CONFLICT다. 경기 복구 제한 GAME_RECOVERY_REQUIRED는 그대로다. 거절은 새 표현을 방송하거나 기존 사용 간격을 소비하지 않는다.
- 연결 종료·heartbeat·앱 종료에서 간격 상태를 정리한다. 이력 저장·재접속 재전송·현재 재생 모션 스냅샷은 없다. requestId는 멱등성 키가 아니므로 자동 재전송하지 않는다. 수신 eventId를 중복 표시하지 않도록 처리할 수 있다.

### 활동 시작으로 감정표현 취소 · WORLD_EMOTE_CANCELLED

새 REST/클라이언트 요청 없이 기존 `/ws/tables`에서 서버가 전송하는 추가 알림이다.
서버가 새 이동·점프 입력, 시설 이용, 테이블 착석을 승인하면 마지막 승인 표현을 한 번 취소한다.
실패·과거 순번 재전송·방향이 없는 정지 입력은 취소하지 않는다. 물리 동기화에서 이동/수영이 확인돼도 취소한다.
채널 퇴장·연결 종료는 남은 같은 채널 사용자에게 취소를 알리고, 본인은 기존 퇴장/종료 처리로 모션을 정리한다.

```json
{
  "requestId": null,
  "type": "WORLD_EMOTE_CANCELLED",
  "payload": {
    "eventId": "00000000-0000-4000-8000-000000000002",
    "emoteEventId": "00000000-0000-4000-8000-000000000001",
    "channelId": "channel-1",
    "userId": "dev-example",
    "reason": "MOVEMENT",
    "sentAt": "2026-10-25T00:00:01Z"
  }
}
```

- reason은 MOVEMENT / ACTIVITY_STARTED / CHANNEL_LEFT / DISCONNECTED다. 알림은 현재 같은 채널에만 전달한다.
- FE는 현재 채널·userId·재생 중인 원본 eventId가 emoteEventId와 모두 일치할 때만 취소한다.
  중복 eventId와 이미 끝난 표현의 취소, 새 표현과 ID가 다른 늦은 취소는 무시한다.
  알림은 마지막 승인 표현을 식별하며 모션 길이/자연 종료는 기존 FE catalog를 유지한다.
- 취소해도 직전 성공 표현의 사용 간격은 유지한다. 취소→재요청/채널 이동으로 간격을 초기화하지 않는다.
- FE 기존 이동/시설 상태 기반 취소는 유지한다. 추가 알림 수신 연결은 FE 후속이며 서버 테스트 통과를 3D 연동 완료로 보지 않는다.
- 악수는 규칙/UI 미정으로 제외한다. 기권·패배 확정 직전 잔여2명이면 판 엎기(2.8초), 나머지는 머리 감싸기(3.6초)다. 클라이언트 명령은 추가하지 않고 [WORLD_GAME_REACTION](world-game-reaction-api.md) 서버 알림으로 전달한다.

검증: WorldEmoteTests(설정/입력·간격 경계/정리), WorldEmoteHubTests(수신 대상·착석/채널 이동·채팅 간격 분리), WorldEmoteWebSocketTests(서버 인증 대역·위조·추가 접속 차단·heartbeat 후 새 연결), TableProtocolTests. 개발 화면 /dev/tables의 감정표현 영역에서 등록 코드를 선택·전송하고 최근 수신 20건을 확인한다. WAVE/CLAP 아이콘은 검증용이다. 채널 변경·끊김은 수신 기록을 비우고 채널 이동 중 전송 대기 시간은 유지한다. 실제 3D·운영·부하 검증을 뜻하지 않는다. 저장소 계약은 Notion과 자동 동기화되지 않는다.

추가 검증: WorldEmoteActivityFlowTests는 실제 HTTP 업그레이드/RawWS에서 이동·점프 승인/중복·실패,
세 시설·테이블 착석의 취소, 다른 채널 차단, 퇴장·단절과 사용 간격 보존을 확인한다.
인증 회원 조회는 테스트 대역, 위치·시간은 서버 fixture이며 실제 OAuth/3D 화면·공유 DB·배포 검증은 아니다.
