# 로그인 사용자와 웹소켓 연결

기존 네이버·SSAFY 로그인에서 받은 **Access JWT → 30초 1회용 접속권 → 웹소켓** 순서입니다. 2026-10-21 사용자 승인, Jira S15P31B105-25. 기본 dev 임시 사용자 모드와 구분합니다.

## 실행 조건

`local,db`와 `--ontop.websocket.authenticated=true`를 사용합니다. DB/JWT/OAuth 환경변수는 기존 [인증 교환](auth-exchange.md)·[DB 안내](../README.md)를 따릅니다. `db` 없는 서버에서는 계정 조회가 준비되지 않아 접속권 발급이 503입니다. 운영 프로필 공개·배포는 이번 범위가 아닙니다. 인증 모드와 start-rehearsal은 동시에 켤 수 없습니다.

## 1. 접속권 발급

| 항목 | 내용 |
| --- | --- |
| 방식·URL | POST `/api/v1/auth/websocket-ticket` |
| 담당자·상태 | 장대산 · 로컬 구현·검증 완료 |
| 인증 | `Authorization: Bearer <Access JWT>` 하나 |
| 요청 본문 | 없음 |
| 성공 | 200, Cache-Control: no-store |

```json
{
  "ticket": "wst_<일회용 접속권>",
  "expiresIn": 30
}
```

`expiresIn`은 최대30초이며 Access JWT의 남은 수명이 더 짧으면 그 시간을 넘지 않습니다. 온보딩 토큰·외부 제공자 토큰·사용자 ID는 받지 않습니다. 서명·발급자·대상·목적·만료 검증은 기존 AccessJwtService를 재사용하고, DB users에서 내부 ID·NAVER/SSAFY·탈퇴 여부를 확인합니다.

| 오류 | 의미 |
| --- | --- |
| 401 AUTH_INVALID_ACCESS_TOKEN | 누락·중복 Authorization, 위조·만료·잘못된 목적의 JWT |
| 401 INVALID_WS_TICKET | 탈퇴·없는 계정, 만료·사용한 접속권 등 |
| 403 AUTH_ORIGIN_NOT_ALLOWED | 허용되지 않은 Origin/preflight |
| 429 WS_TICKET_LIMIT | 미소비 접속권 계정당4개 또는 서버 전체10,000개 상한 |
| 500 AUTH_TOKEN_CONFIGURATION_ERROR | JWT 키·발급자 설정 오류 |
| 503 WS_ACCOUNT_UNAVAILABLE | DB 계정 조회 미설정·실패 |

브라우저 Origin은 AUTH_ALLOWED_ORIGINS로 검사합니다. OPTIONS는 POST와 Authorization 요청 헤더만 허용합니다. Origin 없는 Postman/네이티브 요청도 유효한 Access JWT가 필요합니다. 토큰·접속권 원문은 로그·공유 환경·문서·스크린샷에 저장하지 않습니다.

## 2. 웹소켓 연결

`/ws/tables?ticket=<접속권>`으로 연결합니다. 기존 동일 출처 정책을 유지하므로 프론트와 서버를 같은 공개 출처로 프록시합니다. 발급 시 Origin 유무·값이 연결 때와 같아야 합니다. 브라우저에서 발급했다면 Origin 없는 Postman으로 옮겨 쓰지 않습니다. URL에 Access JWT를 넣거나 임의 Authorization 헤더를 추가하지 않습니다.

- 접속권은 256비트 난수이며 서버에는 SHA-256 해시·내부 ID·출처·만료만 메모리 보관합니다.
- 하나의 접속권은 동시 요청에서도 한 번만 소비합니다. 인증 실패·Upgrade 실패·중복 연결 거절 뒤에는 새 접속권을 발급받습니다.
- 연결 시 DB 계정 상태를 다시 확인합니다. 유효하면 기존 CONNECTED의 userId에 양수 내부 ID 문자열을 보냅니다. JSON 양식은 그대로입니다.
- 누락·위조·만료·재사용·출처 불일치·중복 ticket 쿼리는 HTTP401, 계정 조회 실패는503입니다. 타출처 Upgrade는 기존 정책대로403입니다.
- 서버의 검증된 Principal을 쓰는 기존 WebSocketUserResolver 연결점도 유지합니다. 클라이언트 userId·일반 Principal 이름을 직접 신뢰하지 않습니다.

## 3. 착석·준비·끊김·복귀

CONNECTED → 필요하면 자동 GAME_CONNECTION_STATE 확인 → 채널이 설정됐으면 CHANNEL_JOIN → TABLE_JOIN → 첫 착석자 GAME_SELECT → 참가자 전원 READY_SET입니다. 2명 이상 전원 준비 조건은 그대로이며, 실제 경기 생성·참가비 차감은 별도입니다.

살아 있는 같은 계정의 추가 소켓은 새 연결만1008로 종료합니다. 대기 중 끊기면 좌석·준비는 정리합니다. 실제 경기의 heartbeat 단절은 감지 시점부터30초 유예입니다. **다시 접속권을 발급**받아 연결하면 기존 [경기 복귀](game-reconnect.md) 경로가 최신 상태를 돌려줍니다. 재접속은 원래 턴 마감을 연장하지 않습니다. 경기 복구 Gateway가 없으면 자동 복구를 가정하지 않고 명시 조회는 UNAVAILABLE입니다.

접속권 메모리는 단일 인스턴스이며 재시작하면 소멸합니다. 기존 로그인 계약과 마찬가지로 REST 로그아웃은 Refresh를 폐기하고 프론트는 Access JWT를 지우고 소켓을 닫습니다. 이미 열린 소켓을 로그아웃·JWT 만료 시 서버가 즉시 끊는 기능, 다중 서버 접속권 공유는 이번 범위가 아닙니다.

## 검증

LoginWebSocketFlowTests는 실제 AccessJwtService 서명·검증, HTTP 발급, Raw WebSocket 연결, 착석·전원 준비·중복 차단·heartbeat 끊김·29초 복귀·30초 만료를 연결합니다. 계정 조회와 경기 생성은 테스트 대역입니다. WebSocketTicketTests는 만료·Access 남은 수명·동시 단일 소비·출처·탈퇴·상한과 DB 매핑 코드를 검사합니다. 외부 소셜 로그인·실제 MySQL 접속·정산 성공을 뜻하지 않습니다.

브라우저 생성자는 URL과 프로토콜만 받습니다: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket). 연결 전 검증은 [Spring HandshakeInterceptor](https://docs.spring.io/spring-framework/reference/6.2/web/websocket/server.html)를 사용합니다.
