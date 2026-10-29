# OnTop WebSocket 연결 및 메시지 계약

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
| 채팅·감정 | WORLD_CHAT_SEND / WORLD_EMOTE_SEND | WORLD_CHAT_MESSAGE / WORLD_EMOTE_EVENT / WORLD_EMOTE_CANCELLED |
| 따라가기 | WORLD_FOLLOW_CHECK / WORLD_FOLLOW_START / WORLD_FOLLOW_STOP | WORLD_FOLLOW_STATE ([상세](../world-follow-api.md)) |
| 시설 | WORLD_FACILITY_CHECK / WORLD_FACILITY_CATALOG / WORLD_FACILITY_USE / WORLD_FACILITY_RELEASE / WORLD_FACILITY_AIM | [시설 계약](../world-facility-api.md)의 상태·목록·이용 응답 |
| 착석·준비 | TABLE_JOIN / TABLE_LEAVE / READY_SET / GAME_SELECT | TABLE_STATE / TABLE_LEFT |
| 대기 테이블 보기 | TABLE_WATCH / TABLE_UNWATCH | TABLE_WATCH_STATE / TABLE_WATCH_LEFT |
| 시작 확인 | GAME_START_CHECK | GAME_START_STATE (시작 연결부 활성 시만 요청 허용) |
| 경기 복구 | GAME_RECONNECT_CHECK | GAME_CONNECTION_STATE |
| 경기 상태·관전 | GAME_STATE_CHECK / GAME_WATCH / GAME_UNWATCH | GAME_STATE / GAME_WATCH_LEFT |
| 경기 입력 | GAME_ACTION_SEND | GAME_ACTION_RESULT (개별 GAME_STATE 갱신과 구분) |
| 수동 기권 | GAME_FORFEIT | GAME_FORFEIT_RESULT |
| 오목 관전 채팅·핑 | GAME_SPECTATOR_CHAT_SEND / OMOK_SPECTATOR_PING_SEND | GAME_SPECTATOR_CHAT_MESSAGE / OMOK_SPECTATOR_PING ([상세](../websocket-api/10-game-spectator-events.md), 승인 관전자만 발신) |
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
위 표는 실제 클라이언트 요청 28종이다. ERROR와 CONNECTED는 요청 타입이 아니다.
게스트 인증, 다중 인스턴스 접속권/연결 추적 및 다른 boot의 미완료 경기 자동 반환은 미지원이다.

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
  GAME_RESULT_CHECK를 다시 보낸다. 새 메시지·필드는 없다. 상세: [새로고침 후 결과 발견](../game-recovery.md#새로고침-후-경기-결과-발견-ontop-story-b).

## GAME_SELECT 참가비 계약 (Story 172 보완/173)

GAME_SELECT payload는 `{gameCode, betAmountPerPlayer, targetScore?}`다. 참가비는 필수 양의 안전 정수이며 DICE만 targetScore가 필요하다. TABLE_STATE/TABLE_WATCH_STATE와 테이블 목록에 nullable betAmountPerPlayer가 추가된다. selector만 WAITING에서 변경할 수 있으며 변경 시 전원 준비를 초기화한다. 게임 시작 이후에는 수정할 수 없고 종료 정산은 DB 확정 금액을 사용한다. 상세: [가변 참가비·정산](../game-settlement.md).

READY_SET의 true는 `{ready:true, betAmountPerPlayer, expectedVersion}`이다. 사용자가 확인한
TABLE_STATE의 금액과 version을 전달한다. false는 기존 `{ready:false}`를 유지한다.
누락/형식 오류 INVALID_PAYLOAD, 현재 금액 불일치 GAME_BET_CHANGED, 준비 초기화 이전/미래 버전
GAME_SETTINGS_CHANGED는 상태를 변경하지 않는다. 금액이 다시 같아지는 ABA도 기존 version으로 거절한다.
다른 참가자의 단순 준비 변경은 동의를 무효화하지 않는다. FE는 오류 후 새 금액을 확인받아야 한다.
상세: [준비·취소](../websocket-api/03-ready-set.md).

## 2026-10-27 태블릿·공통 시각 확장 (로컬 구현·미배포)

- TABLE_CONFIGURE: 방장 게임·정원·목표·판돈을 최신 expectedVersion으로 확정, TABLE_STATE 수신.
- TABLE_START: 전원 준비 후 방장만 actionId/expectedVersion으로 수동 시작, 기존 GAME_START_STATE/예약 경계 사용.
- TABLE_HOST_WAIT_CHECK: 현재 본인 대기기한 읽기. TABLE_HOST_WAIT_STATE와 TABLE_HOST_TIMEOUT으로 서버120초 만료·취소·승계를 전달한다.
- WORLD_TIME_CHECK: 빈 payload로 고정 낮밤 기준과 서버현재시각을 WORLD_TIME_STATE로 읽는다. CONNECTED.payload.time에도 추가한다.

기존 GAME_SELECT AUTO 호환을 유지하며 TABLE_CONFIGURE의 MANUAL 테이블만 수동 시작을 사용한다. 상세 필드·오류·동일 로그인 세션30초 대기석 복귀는 [태블릿](../tablet-lobby-api.md), [공통 시각·진단](../world-time-diagnostics-api.md)을 따른다.
