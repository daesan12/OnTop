# OnTop WebSocket 연결 및 메시지 계약

닉네임 50m 표시와 채팅 입력 중 상태는 [WORLD_CHAT_TYPING_SET / WORLD_CHAT_TYPING_STATE](../world-chat-typing-api.md)를 따른다.

완성 텍스트의 공통 빈도·동시 접속 상한과 1013/1009 종료는 [유입 제한](../websocket-ingress-limits.md)을 따른다.
로컬 구현이며 운영 수치·신뢰 프록시·FE 지연 재연결 정책은 협의 전이다.

맵 식별 정보: [CONNECTED / WORLD_MAP_CONFIRM / WORLD_MAP_STATE](../world-map-api.md).
WORLD_MAP_REQUIRE_MATCH=true에서는 확인 전 입장·경기 복구를 보류한다. 기본 false는 기존 FE 호환이다.

따라가기: [WORLD_FOLLOW_START / STOP / CHECK / STATE](../world-follow-api.md).
서버가 매 틱 이동을 판정하고 기존 WORLD_STATE로 좌표를 전송한다.

수동 기권은 [GAME_FORFEIT / GAME_FORFEIT_RESULT](../game-forfeit-api.md)를 사용한다.
현재 인증 참가자만 요청하며 소켓은 유지한다. 기권 승인과 DB 정산 완료는 구분한다.

REST Swagger의 `POST /api/v1/auth/websocket-ticket`과 구분한다. 현재 소스의
TableProtocol, TableHub, TableHandshakeInterceptor, MemberWebSocketConnections를 기준으로 작성했다.
상세 payload는 기존 [공통 메시지](../websocket-api/00-common.md), [회원 인증](../websocket-authentication.md),
[113번 세션 무효화](../session-invalidation.md) 및 아래 개별 계약을 따른다.
이 문서는 게임/지갑 기능을 활성화하거나 프로토콜을 변경하지 않는다.

## 연결 순서

1. 실제 OAuth·교환/온보딩을 완료하여 유효한 Access JWT를 얻는다.
2. `POST /api/v1/auth/websocket-ticket`에 `Authorization: Bearer <Access JWT>`를 보낸다.
   Spring Security가 JWT·활성 회원·sid를 검증한 Authentication을 서비스가 재사용한다.
   클라이언트 userId·Refresh·온보딩 토큰으로 발급할 수 없다.
3. 응답 `{ticket,expiresIn}`의 접속권으로 즉시 연결한다.

```javascript
// jwt는 실제 로그인에서 받은 메모리의 Access JWT다. 출력/로그에 기록하지 않는다.
const response = await fetch('http://localhost:8080/api/v1/auth/websocket-ticket', {
  method: 'POST', headers: { Authorization: `Bearer ${jwt}` }
});
if (!response.ok) throw new Error('접속권 발급 실패');
const { ticket } = await response.json();
const socket = new WebSocket(`ws://localhost:8080/ws/tables?ticket=${encodeURIComponent(ticket)}`);
```

브라우저는 WebSocket 생성 시 임의 Authorization 헤더를 넣을 수 없다. Origin은 브라우저가 자동 전송한다.
HTTPS 환경은 `https` REST와 `wss://…/ws/tables`를 사용한다.
프론트 `http://localhost:5173` / 백엔드 `http://localhost:8080`이라면 local의 AUTH_ALLOWED_ORIGINS에
프론트 Origin을 명시적으로 추가한다. 프론트 페이지의 동일 Origin으로 발급·연결해야 한다.

## Origin·접속권·로그인 계열

- AUTH_ALLOWED_ORIGINS의 기존 형식/정규화/검증을 REST와 WebSocket이 공유한다. 와일드카드는 허용하지 않는다.
- 핸드셰이크는 허용 Origin 검사 → 접속권 일회 소비/발급 Origin 일치/회원·sid 확인 순서다.
  비허용 Origin은 소비 전에 거절한다. 허용된 Origin끼리도 발급/연결이 다르면 소비 후 실패하므로 새로 발급한다.
- 접속권은 256비트 난수, 최대30초·Access 만료 상한·일회용, 인메모리 SHA-256 해시 보관이다.
  회원당 미사용 최대4개, 전체 최대10000개를 넘으면 발급은 429다.
- 새 접속/재접속마다 새 접속권을 받는다. JWT/Refresh 원문을 URL이나 WebSocket session 속성에 저장하지 않는다.
- 소비 시와 연결 등록 시 회원·sid를 재확인하고 커밋 후 폐기 이벤트와 연결 경합을 처리한다.
  로그아웃/탈퇴 후 미사용 접속권도 차단된다. Access JWT가 연결 중 만료되는 것만으로 기존 연결을 닫지는 않는다.
- 프록시 access log/APM/오류 추적에서 `ticket` 쿼리 원문을 제외한다. 전체 URL/쿠키/JWT를 로그에 기록하지 않는다.
- 기본 인증은 true다. `WEBSOCKET_AUTHENTICATED=false`는 local 및 허용된 보조 db/visual-test 조합에서만 가능하다.
  dev/prod 혼합에서 false는 시작 실패한다. 개발 데모 사용자는 실제 회원 인증 계약에서 제외한다.

## 종료 및 재접속

| 단계/코드 | 실제 의미 | 처리 |
| --- | --- | --- |
| HTTP 401 | 잘못된/만료/재사용 접속권, 회원/sid 무효 | 필요시 새 로그인 후 새 접속권 |
| HTTP 403 | 비허용 Origin 등 | 설정/요청 출처 확인 |
| HTTP 503 | 핸드셰이크 인증 조회 장애 | 일시 장애, 의도적 기권 아님 |
| WS 4401 | 로그인 sid 폐기, 등록 시 인증 무효 | 해당 계열 JWT/접속권 재사용 불가 |
| WS 4403 | 회원 비활성화 커밋 후 전체 연결 종료 | 모든 로그인 계열 차단 |
| WS 1013 | Upgrade 후 연결 등록 시 일시 인증 장애 | 서버/DB 장애로 처리 |
| WS 1008 | 중복 회원 연결 또는 인증/정책 위반 | 기존 연결 유지, 새 중복 연결 거절 |
| WS 1011 | 연결 등록의 서버 오류 | 서버 장애 |
| WS 1001 | 기존 전송/연결 정리 경로의 Going away | 단독으로 로그아웃/탈퇴 의미 아님 |

로그아웃은 트랜잭션 커밋 후 해당 sid만, 탈퇴는 커밋 후 회원의 전체 sid를 종료한다.
롤백이면 연결을 유지하며 종료 I/O 실패가 이미 커밋된 DB 상태를 되돌리지는 않는다.
로그인 계열이 달라도 동일 회원의 WebSocket 중복 연결은 기존 한 연결 제한을 유지한다.
네트워크 단절은 heartbeat/전송 실패 등 **서버가 감지한 시각부터** 기존 경기 재접속 30초를 적용한다.
새 연결에는 새 접속권과 유효한 sid가 필요하며, 턴/마감은 초기화하지 않는다.
LOGOUT·MEMBER_DEACTIVATED는 게임에 즉시 이탈 사유로 전달한다. 일반 단절과 Refresh 재사용 탐지의
AUTH_SESSION_REVOKED는 30초 유예다. 즉시 이탈은 경기 전체 종료·정산 완료와 같지 않으며,
다인전은 남은 참가자로 계속할 수 있다. 상세는 [경기 재접속](../game-reconnect.md).

DB 경기 시작 기능이 켜진 환경에서는 연결 직후 자동 확인과 수동 `GAME_RECONNECT_CHECK`가 동일하게
DB 활성 경기와 현재 프로세스 엔진을 대조한다. 둘 다 없을 때만 `LOBBY`이며, DB 활성 경기만 남거나
gameId/instanceId/bootId/종결 상태가 일치하지 않거나 DB 조회가 실패하면 기존
`GAME_CONNECTION_STATE`의 `UNAVAILABLE`과 `code=RECOVERY_UNAVAILABLE`을 반환한다. 이 응답은
gameId/version/state를 노출하지 않으며 기존 FE 파서와 재시도 UI를 그대로 사용한다. 새 WebSocket
이벤트나 상태 값은 추가하지 않았다.

`UNAVAILABLE`, `PENDING`, `EXPIRED` 동안 서버의 로비·테이블·관전 경로는 기존
`GAME_RECOVERY_REQUIRED`로 차단된다. DB 조회는 정산·Wallet·예약을 변경하지 않는다. 30초 유예와
기권/탈락 정책은 유지하며, 엔진 유실이나 다른 boot 기록의 자동 INVALID·환불·복원은 지원하지 않는다.

## 공통 프레임

```json
{"requestId":"req-001","type":"TABLE_JOIN","payload":{"tableId":"table-1"}}
```

- 텍스트 JSON 객체, requestId는 공백이 아닌1~64자, type은 대소문자를 구분하며 payload는 객체다.
- 원문16KiB 제한, 중복 키/추가 JSON/정의되지 않은 필드·payload는 거절한다.
- 서버도 `{requestId,type,payload}`를 사용한다. 직접 응답은 요청 ID, 자발적 broadcast는 null이다.
- ERROR payload는 기존 `{code,message}`다. 임의 userId·sid로 다른 회원을 지정할 수 없다.
- requestId는 응답 연결용이지 영속 구매/경기 입력의 멱등성 보장이 아니다.

## 실제 수신 메시지

| 범위 | 클라이언트 type | 서버 응답/알림 |
| --- | --- | --- |
| 연결 | HTTP Upgrade 후 자동 | CONNECTED (`payload.userId`는 서버 식별) |
| 맵 확인 | WORLD_MAP_CONFIRM | WORLD_MAP_STATE |
| 광장 | CHANNEL_JOIN / CHANNEL_LEAVE | CHANNEL_STATE / CHANNEL_LEFT / WORLD_STATE |
| 이동 | WORLD_MOVE | WORLD_STATE |
| 탈것 대여·하차 | WORLD_MOBILITY_START / WORLD_MOBILITY_END | WORLD_MOBILITY_STATE, 탑승 상태가 바뀌면 WORLD_STATE도 방송 |
| 열기구 탑승·출발 | WORLD_BALLOON_START / WORLD_BALLOON_LAUNCH | WORLD_BALLOON_STATE |
| 열기구 비행·조종석 | WORLD_BALLOON_POSE / WORLD_BALLOON_CONTROL | WORLD_BALLOON_STATE |
| 열기구 종료 | WORLD_BALLOON_END | WORLD_BALLOON_STATE 또는 WORLD_BALLOON_END_ACK |
| C 좌표 검증 이동 (dev 기본) | WORLD_POSITION | WORLD_STATE; local 명시 활성·dev 기본 활성·prod 제외. [계약](../world-movement-prediction.md#c-좌표-검증-이동-계약-dev-기본-적용-prod-제외) |
| 클라이언트 물리 준비 실패 시 서버 이동 복귀 | WORLD_POSITION_FALLBACK | WORLD_STATE; C 모드에서 사용, payload는 현재 epoch |
| 채팅·감정 | WORLD_CHAT_SEND / WORLD_EMOTE_SEND | WORLD_CHAT_MESSAGE / WORLD_EMOTE_EVENT / WORLD_EMOTE_CANCELLED |
| 채팅 입력 중 | WORLD_CHAT_TYPING_SET | WORLD_CHAT_TYPING_STATE |
| 따라가기 | WORLD_FOLLOW_CHECK / WORLD_FOLLOW_START / WORLD_FOLLOW_STOP | WORLD_FOLLOW_STATE ([상세](../world-follow-api.md)) |
| 캐릭터 운반 | WORLD_CARRY_PICKUP / WORLD_CARRY_THROW / WORLD_CARRY_RELEASE | WORLD_STATE |
| 창 입력 점유 | WORLD_INTERACTION_SET | WORLD_INTERACTION_STATE (운반 해제 시 WORLD_STATE도 방송) |
| 마이룸 이용 표시 | WORLD_MYROOM_SET | WORLD_STATE; 본인 `{open:boolean}`, 아바타의 선택적 `myRoomOpen:true`로 공유 ([상세](../world-websocket-api.md)) |
| 월드 문 상태 요청 | WORLD_SECRET_DOORS_SET | WORLD_STATE; `{open:boolean}`, 서버가 현재 위치와 요청 권한 확인 |
| 실내 전환 | WORLD_INTERIOR_ACCESS | WORLD_STATE; `{access:string}`, 서버가 현재 위치와 이동 가능 여부 확인 |
| 시설 | WORLD_FACILITY_CHECK / WORLD_FACILITY_CATALOG / WORLD_FACILITY_USE / WORLD_FACILITY_RELEASE / WORLD_FACILITY_AIM | [시설 계약](../world-facility-api.md)의 상태·목록·이용 응답 |
| 오리배 (220m 공원) | WORLD_BOAT_JOIN / WORLD_BOAT_REPLY / WORLD_BOAT_TEAM, 하차·대기 취소는 WORLD_FACILITY_RELEASE | WORLD_FACILITY_STATE, 알림 WORLD_BOAT_INVITE / WORLD_BOAT_INVITE_CLOSED / WORLD_BOAT_NOTICE ([아래](#오리배-대기초대운항)) |
| 착석·준비 | TABLE_JOIN / TABLE_LEAVE / READY_SET / GAME_SELECT | TABLE_STATE / TABLE_LEFT |
| 대기 테이블 보기 | TABLE_WATCH / TABLE_UNWATCH | TABLE_WATCH_STATE / TABLE_WATCH_LEFT |
| 시작 확인 | GAME_START_CHECK | GAME_START_STATE (시작 연결부 활성 시만 요청 허용) |
| 경기 복구 | GAME_RECONNECT_CHECK | GAME_CONNECTION_STATE |
| 경기 상태·관전 | GAME_STATE_CHECK / GAME_WATCH / GAME_UNWATCH | GAME_STATE / GAME_WATCH_LEFT |
| 경기 입력 | GAME_ACTION_SEND | GAME_ACTION_RESULT (개별 GAME_STATE 갱신과 구분) |
| 수동 기권 | GAME_FORFEIT | GAME_FORFEIT_RESULT |
| 오목 관전 채팅·핑 | GAME_SPECTATOR_CHAT_SEND / OMOK_SPECTATOR_PING_SEND | GAME_SPECTATOR_CHAT_MESSAGE / OMOK_SPECTATOR_PING ([상세](../websocket-api/10-game-spectator-events.md), 승인 관전자만 발신) |
| 주사위 장부 관전 훈수 | DICE_LEDGER_SPECTATOR_PING_SEND | DICE_LEDGER_SPECTATOR_PING ([상세](../dice-ledger.md#관전자-훈수-핑), 승인 관전자만 발신) |
| 알까기 관전 커서·훈수 | ALKKAGI_SPECTATOR_SEND | ALKKAGI_SPECTATOR_EVENT ([상세](../websocket-api/11-alkkagi-spectator-events.md), 로컬 알까기 활성화·관전 권한 필요) |
| 경기 결과 | GAME_RESULT_CHECK | GAME_RESULT |
| 원카드 장난·방어 | ONECARD_PRANK_REACH_SEND / ONECARD_PRANK_HIT_SEND / ONECARD_HAND_RESTORE_SEND / ONECARD_HAND_FLIP_SEND | [방어·차단·뒤집기·복구](../onecard-ux-be-spec.md), 구형 FLIP은 방어 비활성 호환 전용 |
| 오류 | 잘못된 메시지/권한/연동 미준비 | ERROR |

이 목록은 TableProtocol.parse의 실제 switch와 Hub 전송을 대조했다.
기능의 Gateway/엔진/시작 모드가 준비되지 않으면 기존 NOT_CONFIGURED/권한/상태 오류를 반환하며
메시지 이름이 존재한다고 모든 게임/영속 정산이 운영 활성 상태인 것은 아니다.

## 게임 메시지 구조

```json
{
  "requestId": "action-001",
  "type": "GAME_ACTION_SEND",
  "payload": {"gameId":"game-1","actionId":"action-1","expectedVersion":1,"input":{}}
}
```

`input`은 게임별 규칙이며 위 빈 객체는 구조 설명이다. 유효한 실제 게임 동작을 보장하는 예제가 아니다.
gameId 최대120자, actionId 최대64자, expectedVersion은0~9007199254740991 정수다.
GAME_ACTION_RESULT는 `{gameId,actionId,version}` 확인이며 손패/상태를 넣지 않는다.
GAME_STATE는 `{gameId,version,role,publicState,privateState}`이며 관전자 privateState는 `{}`다.
내부 수신 확인용 GameStateView.userId/tableId는 JSON에 노출하지 않는다.
GAME_RESULT는 version/gameSessionId/gameCode/status/endReason/settlementStatus/betAmountPerPlayer/
participants/myCoinDelta/endedAt이며 PENDING의 myCoinDelta는 null이다. 응답을 받았다고 지급이 수행되는 것은 아니다.

세부 필드와 선택적4종 엔진 계약은 기존 [경기 통신](../websocket-api/09-game-communication.md),
[경기 입력](../game-action-api.md), [결과](../game-result-api.md), [광장](../world-websocket-api.md)를 따른다.
ERROR와 CONNECTED는 요청 타입이 아니다.
게스트 인증, 다중 인스턴스 접속권/연결 추적 및 다른 boot의 미완료 경기 자동 반환은 미지원이다.

## 전기자전거·킥보드 대여

`CONNECTED.payload.mobilityAvailable`이 true인 인증 세션이 채널에 입장한 뒤 사용한다. 서버는 거치대와의 거리와 높이, 다른 활동으로 인한 이용 제한, 사용 가능 잔액을 확인한다.

| 요청 | payload | 응답 |
| --- | --- | --- |
| WORLD_MOBILITY_START | `{stationId, vehicle, leaseId}`, 거치대 ID는 `mobility-...`, 탈것은 `BICYCLE` 또는 `SCOOTER`, 대여 ID는 UUID | WORLD_MOBILITY_STATE |
| WORLD_MOBILITY_END | `{leaseId}`, 현재 대여 ID | WORLD_MOBILITY_STATE |

`WORLD_MOBILITY_STATE.payload`에는 `leaseId`, `status`, 누적 차감액 `total`(냥)이 들어간다. 탈것을 알고 있으면 `vehicle`, 새로 확정한 차감을 지갑에 반영해야 하면 `receipt`도 보낸다. 갱신과 자동 하차 알림은 `requestId: null`로 전달한다.

- `RIDING`은 탑승 확정 또는 초당 결제 확정을 뜻한다. 시작할 때 첫 1초분을 차감하고, 이후 탑승 중 1초마다 전기자전거는 1냥, 킥보드는 2냥을 차감한다. 클라이언트는 `receipt`를 받으면 해당 지갑 잔액을 다시 조회한다.
- `ENDED`는 하차, 채널 이탈 등 이용 종료를 뜻한다. 같은 대여 ID의 요청을 재전송해도 같은 초의 요금을 다시 차감하지 않는다. 새 대여에는 새 UUID가 필요하다.
- `INSUFFICIENT`는 다음 요금을 낼 사용 가능 잔액이 부족하다는 뜻이다. `FAILED`는 DB 오류나 결제 처리 지연 등으로 시작 또는 갱신을 확정하지 못했다는 뜻이다. 두 상태 모두 이용을 종료하며 이미 확정한 요금은 `total`에 포함한다.
- 하차가 결제 확정보다 먼저 처리되면 그 회차를 취소한다. 이미 커밋을 시작한 회차는 결과가 나온 뒤 최종 누적액에 반영하고, 다음 회차는 시작하지 않는다.

탑승 상태는 같은 채널의 `WORLD_STATE.payload.vehicles`에 사용자 ID별 탈것 값으로 공유한다. 거리·이용 조건에 맞지 않는 요청에는 `MOBILITY_OUT_OF_REACH`, `MOBILITY_BUSY` 등 `ERROR`를 반환한다.

## 열기구

채널에 입장한 인증 세션에서 사용한다. 먼저 `POST /api/v1/world/balloon/tickets`로 100냥을 결제하고 응답의 `requestId`를 `ticketId`로 보낸다. 다른 열기구에 합류할 때는 결제와 탑승 요청에 같은 `leaderId`를 사용한다.

| 요청 | payload와 동작 |
| --- | --- |
| WORLD_BALLOON_START | `{ticketId, x, y, z}`로 탑승을 시작한다. 새 기체는 `capacity`(1~4)와 `mode`(`solo` 또는 `split`)를 지정할 수 있다. 합류 시에는 `leaderId`를 보낸다. |
| WORLD_BALLOON_LAUNCH | `{ticketId, solo?}`로 탑승 대기를 끝낸다. 분담 조종에서 `solo: true`를 보내면 혼자 조종하는 상태로 출발을 요청한다. |
| WORLD_BALLOON_POSE | `{ticketId, x, y, z, aboard}`에 기내 상태 `cabin`과 조종 입력 `input`을 추가할 수 있다. `input`을 보낼 때는 `cabin`도 필요하다. |
| WORLD_BALLOON_CONTROL | `{ticketId, role, action}`. 역할은 `direction` 또는 `altitude`다. 동작은 `claim`, `leave`, `return`, `offer`, `accept`이며, `offer`에는 `peer`, `accept`에는 `offerId`를 추가한다. |
| WORLD_BALLOON_END | `{ticketId}`로 비행을 종료한다. 종료할 표시 상태가 없으면 요청자에게 `WORLD_BALLOON_END_ACK`를 보낸다. |

서버는 비행 위치와 탑승 상태를 `WORLD_BALLOON_STATE`로 같은 채널에 공유한다. 종료 상태의 `flight`는 `null`이다. 관찰자는 이 상태로 기체와 탑승 아바타를 표시한다. [열기구 이용 및 검증 절차](../../frontend/src/features/balloon/README.md)

## 겨울 공원 · 눈싸움

기존 인증·맵 확인·채널 입장 절차를 그대로 사용한다. 공원 놀이이며 경기 보상·지갑·정산을 만들지 않는다.
상세 필드·오류·동결 해제는 [겨울 공원·눈싸움 계약](../world-winter-api.md)을 따른다.

| 요청 | payload | 응답/방송 |
| --- | --- | --- |
| WORLD_SNOWBALL_PICKUP | `{pileId}`. 서버가 바닥 눈더미까지의 거리를 확인해 한 개를 줍는다. | WORLD_SNOWBALL_STATE |
| WORLD_SNOWBALL_CHECK | `{}`. 현재 채널의 눈 소지·피격·동결 상태를 조회한다. | WORLD_SNOWBALL_STATE |
| WORLD_SNOWBALL_PREPARE | `{yaw}`. 300ms 던지기 준비 동작이며 소지량·명중은 변경하지 않는다. | WORLD_SNOWBALL_WINDUP |
| WORLD_SNOWBALL_AIM | `{yaw}`. 실제 발사와 같은 서버 판정으로 표적을 조회하며 요청자에게만 응답한다. | WORLD_SNOWBALL_AIM_STATE |
| WORLD_SNOWBALL_THROW | `{yaw}`. 서버 위치·정적 구조물·현재 대상을 확인해 눈 한 개를 소비하고 발사한다. | WORLD_SNOWBALL_EVENT |
| WORLD_SNOWBALL_ESCAPE | `{freezeId, key}`. 현재 동결 ID와 A/D 교대 입력으로 탈출한다. | WORLD_SNOWBALL_STATE |

`WORLD_SNOWBALL_STATE`는 채널 입장과 상태 변경 시 같은 채널에 공유한다. 3회 피격 시 5초 동안 동결되며,
자연 만료와 A/D 탈출 모두 물리 이동 잠금을 해제하고 월드·눈싸움 상태를 전파한다. FE의 소지 중 미리보기는
로컬 물리 월드를 사용하고, 서버 조준 조회는 승인된 준비 동작당 최대 한 번으로 제한한다. 실제 명중은 서버가 확정한다.

## 오리배 대기·초대·운항

220m 공원 생성물의 `interactions.boats`(선착장 대기 자리 4곳, 하차 위치, 1분 운항 경로)가 있고 DB 지갑이 있는 서버에서만 쓸 수 있다. 시설 종류는 `BOAT`이며 좌석 0~3은 대기 자리(팀×2+자리), 4번부터는 배마다 두 좌석이다. 일반 `WORLD_FACILITY_USE`로는 들어올 수 없다(`BOAT_JOIN_REQUIRED`).

| 요청 | payload | 응답 |
| --- | --- | --- |
| WORLD_BOAT_JOIN | `{}`(혼자) 또는 `{partnerId}`(같은 채널 사용자 초대). 선착장 가까이에서 요청 | WORLD_FACILITY_STATE |
| WORLD_BOAT_REPLY | `{inviterId, accept}`. 수락하면 위치와 상관없이 초대한 사람 옆 대기 자리로 옮긴다 | WORLD_FACILITY_STATE |
| WORLD_BOAT_TEAM | `{action:"SOLO"}` 또는 `{action:"INVITE", partnerId}`. 초대 중이거나 고르는 중일 때 | WORLD_FACILITY_STATE |

- 대기는 두 팀까지다. 초대 응답은 15초, 거절·무응답 뒤 고르기는 10초이며 고르지 않으면 대기에서 빠진다.
- 준비된 팀만 먼저 온 순서로, 직전 출발 10초 뒤부터 출발한다. 동시에 최대 4척이며 돌아오는 배와 진입로가 겹치는 시각에는 출발하지 않는다.
- 출발 순간 1인 30냥을 `DUCK_BOAT_FEE` 원장(키 `duck-boat:<walletId>:<leaseId>`)으로 한 번 차감한다. 중간 하차는 환불하지 않는다.
- `WORLD_FACILITY_STATE.payload.boats`는 `{fare, lapMillis, teams:[{slot, members, phase, partnerId, deadline, departAt}], trips:[{boat, departedAt}]}`이며 시각은 epoch 밀리초다. 운항 중인 탑승자 위치는 경로와 `departedAt`으로 계산한다.
- 알림: `WORLD_BOAT_INVITE {inviterId, channelId, expiresAt, fare}`, `WORLD_BOAT_INVITE_CLOSED {inviterId}`, `WORLD_BOAT_NOTICE {status, fare, leaseId}`. status는 PAID, ARRIVED, INSUFFICIENT, FAILED, ACCEPTED, DECLINED, EXPIRED, CANCELLED다.
- 주요 오류: BOAT_UNAVAILABLE, BOAT_PARTNER_UNAVAILABLE, BOAT_INVITE_CLOSED, BOAT_TEAM_INVALID, FACILITY_OCCUPIED(대기열 가득), FACILITY_OUT_OF_RANGE.
- 서버 재시작 시 대기와 운항은 복원하지 않는다.

## 캐릭터 들기·던지기와 창 입력 점유

인증된 기존 연결과 채널을 사용하며 요청자 ID는 서버 연결에서 가져온다. 추가 userId 필드는 허용하지 않는다.

| 요청 | payload | 성공 응답 |
| --- | --- | --- |
| WORLD_CARRY_PICKUP | `{targetId}`: 같은 채널의 다른 사용자 ID | WORLD_STATE |
| WORLD_CARRY_THROW | `{carryId, dx, dy, dz}`: 현재 관계의 UUID와 정규화된 투척 방향. FE는 입력 순간 캐릭터 정면 `(sin(yaw), 0, cos(yaw))` 전송 | WORLD_STATE |
| WORLD_CARRY_RELEASE | `{carryId}`: 현재 운반 관계의 UUID | WORLD_STATE |
| WORLD_INTERACTION_SET | `{busy, vrActive?}`: 본인 입력 점유와 별도 VR 실행 여부(boolean). VR true이면 busy도 true | WORLD_INTERACTION_STATE `{channelId, busy, vrActive?}`; vrActive를 요청한 경우에만 응답에도 포함 |

FE는 기존 운반·비행 중의 채팅 입력/전송을 창 점유에서 제외해 관계를 유지한다. 채팅의 이동·투척·A/D 탈출 키 차단은 유지하며, 운반 중이 아닌 채팅 사용자의 들기 방지와 다른 창의 안전 해제는 기존대로 적용한다. WS 필드와 서버 판정 계약은 변경하지 않는다.

WORLD_STATE의 `avatars[].carry`는 null 또는 `{carryId, partnerId, role}`이며 role은 CARRIER/CARRIED/THROWN이다.
창 점유 중인 사용자는 `interactionBusy: true`를 공유한다. 일반 창 점유 변경은 작은 확인 응답을 보내고
다른 사용자에게는 기존 10Hz 방송에 합쳐 전달한다. 실제 운반 해제가 발생한 경우에는 즉시 WORLD_STATE를 방송한다.

들기·던지기는 본인과 상대방의 게임·관전·시설·수영·감정표현·따라가기·점프맵·창 점유 상태를 검사한다.
들기는 수평 거리 2.6m·높이 차이 2m 이내를 검사하며 시간 제한 없이 유지한다.
양쪽 모두 일반 달리기·점프 중에도 들고 던질 수 있다. 피운반자의 기존 이동/점프 입력은 들기 승인 시 정리한다.
피운반자는 A·D를 번갈아 6회 눌러 탈출한다. 같은 키·1초 이상 입력 중단·포커스/운반 관계 변경은 진행을 초기화하며 키 자동 반복은 세지 않는다.
FE는 완성된 입력에서 기존 WORLD_CARRY_RELEASE를 한 번 요청한다. 키별 WS 요청은 추가하지 않으며 서버는 기존 인증·carryId 권한을 검사한다.
운반자의 Esc 내려놓기·창/활동 점유·막힌 공간·이탈 시에도 현재 위치 주변의 안전한 위치에 내려놓는다.
중복되거나 낡은 carryId 요청은 거절하며 비행 중 수동 위치 보고로 서버 좌표를 덮어쓸 수 없다.
주요 오류는 CARRY_ACTIVITY_CONFLICT, CARRY_TARGET_UNAVAILABLE, CARRY_OUT_OF_RANGE,
CARRY_UNAVAILABLE, CARRY_LINK_MISMATCH, INVALID_PAYLOAD다. 상세 동작과 검증 범위는
[공원 캐릭터 들기·던지기](../../frontend/docs/AVATAR_CARRY_THROW.md)를 따른다. 서버 재시작 시 운반 관계 복원은 지원하지 않는다.

## Story 174 결과·전달·복구

- FINISHED는 참가자 result 필수, INVALID는 판정 없는 참가자의 result=null 허용.
- INVALID/PENDING은 myCoinDelta=null, INVALID/SETTLED는 0. DB 확정 B 예약만 해제하고 balance 유지.
- 이탈 이벤트를 영속화하며 최종 판정 전에는 참가비 예약을 유지한다.
- GameEventDelivery의 현재 프로세스 메모리 보관 → 비동기 DB 수신 커밋 ACK → 정산/반환 재시도.
  최초 DB ACK 전 프로세스 종료의 유실은 해결하지 않는다.
- 정산·반환과 같은 트랜잭션의 영속 outbox → 서버 내부 결과 알림 재시도.
  클라이언트 수신 ACK·다중 노드 전달·오프라인 사용자별 수신함은 지원하지 않는다.
- 같은 경기/version 중복·역순 알림은 최신 결과를 유지한다. GAME_RESULT_CHECK는 같은 저장 결과를 읽으며 지급하지 않는다.
- 현재 boot의 SETTLING은 신뢰된 DB 종결 결과로 복구한다. 다른 boot의 미완료 경기 자동 INVALID/반환은 미구현이다.
- 자세한 nullable/필드 규칙: [결과](../game-result-api.md), [Story 174 구현과 한계](../game-recovery.md).
- 새로고침·재연결 후 FE는 이 탭의 경기 ID가 경기 내역 REST의 최근 종료 경기와 같을 때만 기존
  GAME_RESULT_CHECK를 다시 보낸다. 새 메시지·필드는 없다.
- 서버가 유지한 좌석(대기석 유예 복귀·frozen 좌석)의 재접속은 `CONNECTED` 직후 TABLE_STATE와 이 테이블의 GAME_START_STATE를
  받는다. FE는 채널 입장·테이블 목록 조회 뒤 적용한다. 상세: [Story C](../game-recovery.md#새로고침websocket-재접속-좌석시작-상태-수신-ontop-story-c). 상세: [새로고침 후 결과 발견](../game-recovery.md#새로고침-후-경기-결과-발견-ontop-story-b).

## GAME_SELECT 참가비 계약 (Story 172 보완/173)

GAME_SELECT payload는 `{gameCode, betAmountPerPlayer, targetScore?}`다. 참가비는 0 이상의 필수 안전 정수이며 DICE만 targetScore가 필요하다. TABLE_STATE/TABLE_WATCH_STATE와 테이블 목록에 nullable betAmountPerPlayer가 추가된다. selector만 WAITING에서 변경할 수 있으며 변경 시 전원 준비를 초기화한다. 게임 시작 이후에는 수정할 수 없고 종료 정산은 DB 확정 금액을 사용한다. 상세: [가변 참가비·정산](../game-settlement.md).

READY_SET의 true는 `{ready:true, betAmountPerPlayer, expectedVersion}`이다. 사용자가 확인한
TABLE_STATE의 금액과 version을 전달한다. false는 기존 `{ready:false}`를 유지한다.
누락/형식 오류 INVALID_PAYLOAD, 현재 금액 불일치 GAME_BET_CHANGED, 준비 초기화 이전/미래 버전
GAME_SETTINGS_CHANGED는 상태를 변경하지 않는다. 금액이 다시 같아지는 ABA도 기존 version으로 거절한다.
다른 참가자의 단순 준비 변경은 동의를 무효화하지 않는다. FE는 오류 후 새 금액을 확인받아야 한다.
상세: [준비·취소](../websocket-api/03-ready-set.md).

## 2인 기권 연출·공원 잔해 (2026-10-31, 로컬 구현)

`WORLD_GAME_REACTION.participantCount`는 최초 참가 인원이다. 최초 2인 경기의 명시적 기권만 판을 엎으며
일반 패배·연결 이탈·다인 경기는 판을 던지지 않는다. `WORLD_PARK_DEBRIS_STATE`는 같은 공원에 남는
판·엽전 전체 상태를 채널 입장과 변경 시 공유한다. 기권 확정 후 15초가 지나면 서버가 자동 제거하며,
만료 전 재접속 시 현재 잔해를 복원한다. 서버 재시작 시 초기화한다.
현재 청소 AI는 없고 서버 내부 개별 물체 제거 연결점을 제공한다. [상세 계약·유지 범위](../world-game-reaction-api.md#공원에-남는-판엽전--world_park_debris_state-2026-10-31).

## 2026-10-27 태블릿·공통 시각 확장 (로컬 구현·미배포)

- TABLE_CONFIGURE: 방장 게임·정원·목표·판돈을 최신 expectedVersion으로 확정, TABLE_STATE 수신.
- TABLE_START: 전원 준비 후 방장만 actionId/expectedVersion으로 수동 시작, 기존 GAME_START_STATE/예약 경계 사용.
- TABLE_HOST_WAIT_CHECK: 현재 본인 대기기한 읽기. TABLE_HOST_WAIT_STATE와 TABLE_HOST_TIMEOUT으로 서버120초 만료·취소·승계를 전달한다.
- WORLD_TIME_CHECK: 빈 payload로 고정 낮밤 기준과 서버현재시각을 WORLD_TIME_STATE로 읽는다. CONNECTED.payload.time에도 추가한다.

기존 GAME_SELECT AUTO 호환을 유지하며 TABLE_CONFIGURE의 MANUAL 테이블만 수동 시작을 사용한다. 상세 필드·오류·동일 로그인 세션30초 대기석 복귀는 [태블릿](../tablet-lobby-api.md), [공통 시각·진단](../world-time-diagnostics-api.md)을 따른다.
