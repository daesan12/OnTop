# 로그인 사용자와 웹소켓 연결

기존 네이버·SSAFY 로그인에서 받은 **Access JWT → 30초 1회용 접속권 → 웹소켓** 순서입니다.
MR !14의 접속권 저장·소비·Origin 결합을 유지하고, S15P31B105-100에서 공통 회원 인증과 연결했습니다.

[REST 공통 인증](rest-authentication.md)의 `AccessAuthenticationService`와 `AuthenticatedUser`를 재사용합니다.
S15P31B105-113에서 JWT sid와 로그인 계열 종료를 연결했습니다. OAuth·Refresh 회전/쿠키 정책은 유지합니다.
명시적 로그아웃/탈퇴 사유는 기존 게임의 즉시 이탈 경로에 전달합니다. 게스트·최종 정산·오프라인 유예 개선은
후속 범위입니다. [세션 무효화 계약](session-invalidation.md)을 함께 확인합니다.

## 실행 조건

인증 기본값은 **true**입니다. 환경변수 `WEBSOCKET_AUTHENTICATED` 또는 기존 프로퍼티로 지정할 수 있습니다.
루트 `.env.example`에 예제가 있으며 application.yml의 `${WEBSOCKET_AUTHENTICATED:true}`에 연결됩니다.

| 환경 | 인증 | 등록/실패 정책 |
| --- | --- | --- |
| local | 기본 true | 실제 회원은 db 프로필과 기존 DB/JWT 설정 필요 |
| 명시적 local 비인증 | false | dev-UUID 개발 사용자 허용 |
| dev·prod·기타 비local | true 필수 | 접속권 REST와 WebSocket 기반 빈 등록 |
| 비local 또는 local,dev / local,prod 혼합 | false | 시작 실패 |

비인증 허용 프로필 조합은 local과 보조 db/visual-test뿐입니다. 새 보조 프로필은 정책 검토 없이 자동 허용하지 않습니다.
기본 실행은 DB 없이 시작할 수 있지만 회원 조회가 준비되지 않으면 접속권 발급은 503입니다.
비인증을 기본값으로 대체하거나 임의 회원을 만들지 않습니다. 인증과 start-rehearsal 동시 실행도 계속 거절합니다.

```powershell
# 실제 로컬 회원 인증 (기존 환경변수를 IntelliJ 또는 프로세스에 별도 주입)
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'

# 기존 익명 개발 화면/소켓을 명시적으로 사용하는 경우
.\gradlew.bat bootRun --args='--spring.profiles.active=local,visual-test --ontop.websocket.authenticated=false'
```

필수 설정 이름은 DB_URL, DB_USERNAME, DB_PASSWORD, AUTH_JWT_SECRET_BASE64, AUTH_JWT_ISSUER입니다.
브라우저 발급에는 AUTH_ALLOWED_ORIGINS도 실제 출처로 지정합니다. 값과 쿠키 설정은 기존
[인증 교환](auth-exchange.md)·[DB 프로필](../backend/src/main/resources/application-db.yml)을 따릅니다.
.env는 자동 로드하지 않으며 비밀번호·키를 실행 명령이나 문서에 적지 않습니다.

비local 등록에는 TableHub·WebSocket 설정/핸들러/인터셉터/메트릭과 필수 광장 기반 서비스의 등록 조건만
Servlet 환경으로 확장했습니다. Hub·광장 서비스의 메서드 본문은 변경하지 않았으며,
WebSocket 등록 설정에는 이번 Origin 정책 연결을 반영했습니다.
채널/테이블 REST와 개발 화면, 게임 엔진·경기 시작/복귀/결과 서비스의 기존 local 제한은 유지합니다.
따라서 비local WebSocket 등록이 모든 게임 기능의 운영 배포 완료를 뜻하지 않습니다.

## 1. 접속권 발급

| 항목 | 내용 |
| --- | --- |
| 방식·URL | POST `/api/v1/auth/websocket-ticket` |
| 구현 범위 | MR !14 접속권 유지 · S15P31B105-100 공통 회원 인증 연동 |
| 인증 | `Authorization: Bearer <Access JWT>` 하나 |
| 요청 본문 | 없음 |
| 성공 | 200, Cache-Control: no-store |

```json
{
  "ticket": "wst_<일회용 접속권>",
  "expiresIn": 30
}
```

`expiresIn`은 최대30초이며 Access JWT의 남은 수명이 더 짧으면 그 시간을 넘지 않습니다.
온보딩 토큰·외부 제공자 토큰·클라이언트 userId/provider/role을 인증 정보로 받지 않습니다.
이 REST 경로는 공개 목록에 넣지 않았으며 기존 SecurityFilterChain의 회원 인증이 먼저 적용됩니다.
코드 리뷰 반영 후 발급 경로는 다음과 같습니다.

1. 기존 Origin 필터가 허용 출처/preflight를 검사합니다.
2. 보호 SecurityFilterChain의 Resource Server가 기존 AccessJwtDecoder/AccessJwtService로 JWT를 한 번 검증합니다.
3. 공통 `AccessAuthenticationService.requireActive(userId, sid)`가 회원/로그인 계열을 한 번 조회합니다.
4. SecurityContext의 Authentication에 기존 `AuthenticatedUser` Principal과 검증된 만료 메타데이터를 저장합니다.
   details는 `AuthenticatedAccess(user, expiresAt)`이며 원문 JWT를 포함하지 않습니다.
5. Controller/접속권 서비스가 이 Authentication을 받아 발급합니다. 서비스는 인증 여부·회원 Principal·
   ROLE_MEMBER·메타데이터 일치·남은 유효시간을 확인하며 JWT/회원 DB 조회를 반복하지 않습니다.

`issue(userId)`나 원문 토큰을 받는 별도 발급 경로는 없습니다. Principal만 있거나 검증 메타데이터가 빠진
Authentication은 서비스에서도 거절합니다. 공개 체인으로 이동하지 않았으며, 핸드셰이크에서는 JWT를 다시 요구하지 않습니다.

| 오류 | 의미 |
| --- | --- |
| 401 AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN | Access 누락 / 형식·중복·위조·만료·용도 오류 |
| 401 AUTH_MEMBER_STATE_CHANGED | 공통 REST 인증에서 없는 회원·탈퇴 회원 거절 |
| 401 INVALID_WS_TICKET | 발급 시 신뢰된 인증 메타데이터 미충족, 연결 시 탈퇴·없는 계정, 만료·사용한 접속권 등 |
| 403 AUTH_ORIGIN_NOT_ALLOWED | 허용되지 않은 Origin/preflight |
| 429 WS_TICKET_LIMIT | 미소비 접속권 계정당4개 또는 서버 전체10,000개 상한 |
| 500 AUTH_TOKEN_CONFIGURATION_ERROR | JWT 키·발급자 또는 Origin 목록 설정 오류 |
| 503 AUTH_MEMBER_LOOKUP_UNAVAILABLE / WS_ACCOUNT_UNAVAILABLE | REST 인증 / 접속권·핸드셰이크 회원 조회 미설정·실패 |

브라우저 Origin은 AUTH_ALLOWED_ORIGINS로 검사합니다. OPTIONS는 POST와 Authorization 요청 헤더만 허용합니다. Origin 없는 Postman/네이티브 요청도 유효한 Access JWT가 필요합니다. 토큰·접속권 원문은 로그·공유 환경·문서·스크린샷에 저장하지 않습니다.
쿠키는 발급/소비에 사용하지 않습니다. 브라우저 발급 fetch는 `credentials: 'omit'`을 사용합니다.
ONTOP_REFRESH와 JSESSIONID의 기존 Secure/SameSite/Path 정책은 바꾸지 않았습니다.

## 2. 웹소켓 연결

`/ws/tables?ticket=<접속권>`으로 연결합니다. **AUTH_ALLOWED_ORIGINS에 명시된 다른 출처도 허용**합니다.
발급 시 Origin 유무·값이 연결 때와 같아야 합니다. 브라우저에서 발급했다면 Origin 없는 Postman으로 옮겨 쓰지 않습니다.
URL에 Access JWT를 넣거나 임의 Authorization 헤더를 추가하지 않습니다.

### 허용 Origin과 검사 순서

REST의 AuthExchangeOriginPolicy를 공유하고, 정규화된 목록을 WebSocket Handler의 setAllowedOrigins에 전달합니다.
와일드카드/패턴 전체 허용은 사용하지 않습니다.

- 설정: AUTH_ALLOWED_ORIGINS의 쉼표 구분 목록, 최대32개.
- 기본값: local은 `http://localhost:8080,http://127.0.0.1:8080`, 그 외에는 빈 목록입니다.
- 형식: HTTPS Origin(스킴·호스트·포트), local에서만 HTTP loopback 허용.
- 기존대로 호스트/스킴 대소문자·기본 포트·루트 슬래시를 정규화하며 경로·쿼리·사용자 정보·와일드카드는 거절합니다.
- 브라우저는 동일 출처라도 목록에 실제 Origin을 등록해야 합니다. Origin 없는 네이티브/Postman은 기존 정책대로
  허용하되, cross-site Fetch Metadata와 함께 Origin이 누락된 요청은 거절합니다. 접속권 인증은 항상 필요합니다.
- 잘못된 목록은 Handler의 허용 목록에 넣지 않습니다. 기존 DB 없는 기본 시작/요청 시점 오류 계약을 유지하며,
  Origin을 검사하는 요청에는 안전한 설정 오류(500)를 반환합니다.

검사 순서는 `Origin 허용 정책 → 접속권 형식/원자적 소비·발급 Origin 일치·만료 → 회원 활성 조회 →
Spring 기본 Origin 검사 → HTTP Upgrade`입니다. [Spring 등록 구현](https://github.com/spring-projects/spring-framework/blob/v6.2.19/spring-websocket/src/main/java/org/springframework/web/socket/config/annotation/AbstractWebSocketHandlerRegistration.java)이
기본 Origin 인터셉터를 등록 목록 뒤에 추가하므로
접속권 소비 전에 같은 정책의 인터셉터를 명시적으로 배치했습니다.

비허용/잘못된 Origin은403이며 접속권을 소비하지 않습니다. **허용된 Origin끼리라도 발급 출처와 다르면401이며,
이미 소비한 접속권은 복원하지 않습니다.** 프록시의 내부 Host가 프론트 Origin과 달라도 명시된 출처는 허용합니다.
Host를 Origin과 같게 꾸미는 것만으로 비허용 출처를 우회할 수 없습니다.

- 접속권은 256비트 난수이며 서버에는 SHA-256 해시·내부 ID·로그인 sid·출처·만료만 메모리 보관합니다.
- 하나의 접속권은 동시 요청에서도 한 번만 소비합니다. 소비 이후 인증 실패·Upgrade 실패·중복 연결 거절 뒤에는 새 접속권을 발급받습니다.
- 연결 시 DB 계정 상태를 다시 확인합니다. 유효하면 기존 CONNECTED의 userId에 양수 내부 ID 문자열을 보냅니다. JSON 양식은 그대로입니다.
- 누락·위조·만료·재사용·발급 출처 불일치·중복 ticket 쿼리는 HTTP401, 계정 조회 실패는503입니다. 비허용 Origin은403입니다.
- 서버의 검증된 Principal을 쓰는 기존 WebSocketUserResolver 연결점도 유지합니다. 클라이언트 userId·일반 Principal 이름을 직접 신뢰하지 않습니다.

### 프론트와 백엔드의 Origin이 다른 로컬 예시

프론트가 `http://localhost:5173`, 백엔드가 `http://localhost:8080`이면 local 프로필에서
AUTH_ALLOWED_ORIGINS에 프론트 Origin을 추가합니다. 기존 개발 화면도 사용할 경우8080 항목을 함께 유지합니다.

```ini
AUTH_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080,http://127.0.0.1:8080
WEBSOCKET_AUTHENTICATED=true
```

```javascript
async function connectTables(accessToken) {
  const response = await fetch('http://localhost:8080/api/v1/auth/websocket-ticket', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'omit'
  });
  if (!response.ok) throw new Error('WebSocket 접속권 발급 실패');
  const { ticket } = await response.json();
  return new WebSocket(`ws://localhost:8080/ws/tables?ticket=${encodeURIComponent(ticket)}`);
}
```

브라우저가 두 요청의 Origin을 자동으로5173 출처로 전송합니다. 애플리케이션에서 Origin을 위조하거나
백엔드 출처로 바꾸지 않습니다. HTTPS 배포에서는 실제 프론트 Origin을 등록하고 HTTPS/WSS 주소로 전환합니다.
동일 출처 프록시도 계속 사용할 수 있습니다. Refresh/JSESSIONID 쿠키나 credentials 정책은 변경하지 않습니다.

### 회원 매핑과 탈퇴 재검증

`AuthenticatedUser`와 `VerifiedWebSocketUser`는 별도 타입을 유지합니다.
`VerifiedWebSocketUser.from()`이 내부 userId를 보존하고 SSAFY/NAVER를 명시적으로 매핑합니다.
핸드셰이크의 WebSocketAccountLookup 어댑터는 공통 `requireActive(userId, sid)`로 회원/계열을 다시 확인합니다.
S15P31B105-113에서 Upgrade 후 pending 연결 등록과 폐기 알림 사이의 경합도 재검증합니다.
실제 읽기 전용 트랜잭션과 users 조회는 기존 JpaActiveMemberLookup이 담당합니다.
발급 후 탈퇴한 회원은 이 시점에 401이며, DB 장애는 503으로 구분합니다.
DB 확인 직후 발생하는 탈퇴와 이미 연결된 소켓의 종료는 별도 연결 폐기 정책이 필요합니다.

현재 운영 WebSocketUserResolver 구현체를 새로 추가하지 않았습니다. 접속권이 없는 운영 연결은 거절하며,
기존 서버 Principal 경계는 테스트 전용 인증 대역과 데모를 위해 유지합니다. 인증 성공한 DTO만 기존 세션 속성에
저장하고 TableWebSocketHandler가 기존 TableHub.connectAuthenticated()로 전달합니다.
메시지의 userId로 이 값을 덮어쓰지 않으며, 기존 payload 위조 거절 로직을 유지합니다.

## 3. 착석·준비·끊김·복귀

CONNECTED → 필요하면 자동 GAME_CONNECTION_STATE 확인 → 채널이 설정됐으면 CHANNEL_JOIN → TABLE_JOIN → 첫 착석자 GAME_SELECT → 참가자 전원 READY_SET입니다. 2명 이상 전원 준비 조건은 그대로이며, 실제 경기 생성·참가비 차감은 별도입니다.

살아 있는 같은 계정의 추가 소켓은 새 연결만1008로 종료합니다. 대기 중 끊기면 좌석·준비는 정리합니다. 실제 경기의 heartbeat 단절은 감지 시점부터30초 유예입니다. **다시 접속권을 발급**받아 연결하면 기존 [경기 복귀](game-reconnect.md) 경로가 최신 상태를 돌려줍니다. 재접속은 원래 턴 마감을 연장하지 않습니다. 경기 복구 Gateway가 없으면 자동 복구를 가정하지 않고 명시 조회는 UNAVAILABLE입니다.

접속권 메모리는 단일 인스턴스이며 재시작하면 소멸합니다. 서버는 해시·ID·로그인 sid·Origin·만료만 보관하며 계정당4개/
전체10,000개 상한과 발급 시 만료 정리를 유지합니다. 소비 후 인증/DB/Upgrade/중복 연결 실패 시 복원하지 않습니다.
새 접속권을 발급받아야 합니다.

연결한 뒤에는 기존 Access 만료만으로 소켓을 닫지 않습니다. 새 연결·재접속은 새 접속권이 필요하며,
Access가 만료됐다면 기존 Refresh API로 갱신한 뒤 발급받습니다. 기존 30초 네트워크 복귀·중복 연결·턴 타이머는 그대로입니다.
S15P31B105-113부터 로그아웃 커밋 후 같은 sid의 Access/미소비 접속권은 거절하고 그 계열 소켓을4401로 닫습니다.
다른 로그인 계열은 유지합니다. 탈퇴용 내부 알림은 커밋 후 그 회원의 전체 소켓을4403으로 닫습니다.
실제 탈퇴 API 호출은 [USER-03](user-withdrawal.md)이 연결했습니다.
명시적 로그아웃은 LOGOUT/4401, 회원 탈퇴는 MEMBER_DEACTIVATED/4403으로 기존 Hub·경기 복귀 서비스의
즉시 이탈 경로에 전달합니다. Refresh 재사용 감지와 일반 세션 폐기는 AUTH_SESSION_REVOKED/4401이며
일반 네트워크 단절과 함께 기존 30초 유예를 유지합니다. AUTH_SESSION_REVOKED 전체를 로그아웃으로 해석하지 않습니다.
원인은 서버 내부 이벤트로만 정하며 클라이언트 close 문자열/메시지로 지정할 수 없습니다.
이미 정리된 오프라인 연결·원인 경합·최종 정산·게스트·다중 서버 알림은 이번 범위에서 해결하지 않습니다.
[세션 무효화와 연결 종료](session-invalidation.md)에 트랜잭션·장애·프론트 계약을 정리했습니다.

## 실제 회원 수동 테스트

1. 실제 OAuth → 동일 세션 exchange 또는 신규 온보딩을 완료해 Access를 얻습니다. Access는 메모리 또는
   공유하지 않는 Postman 로컬 변수에만 보관하고 출력하지 않습니다.
2. `POST /api/v1/auth/websocket-ticket`에 Access Bearer 하나를 전송합니다. 본문·JSESSIONID·Refresh 쿠키는 필요 없습니다.
   200, no-store, expiresIn ≤ 30과 접속권 응답을 확인합니다.
3. Postman은 Origin 없이 발급했다면 Origin 없이 `ws://localhost:8080/ws/tables?ticket=<새 접속권>`으로 연결합니다.
   CONNECTED.userId가 실제 내부 ID인지 로컬에서만 확인합니다. 실제 값을 보고서나 화면 공유에 남기지 않습니다.
4. 브라우저는 허용 목록에 실제 프론트 Origin을 등록합니다. 동일 출처 프록시 또는 위 교차 출처 예시를 사용하며,
   발급 Origin과 연결 Origin을 일치시키고
   `new WebSocket(...)`에는 Access 대신 접속권만 전달합니다. Cookie 인증이나 임의 Authorization 헤더를 가정하지 않습니다.
5. 같은 접속권 재사용과 발급 후30초 경과 연결은 HTTP401입니다. 같은 계정의 새 접속권은 Upgrade 후 새 연결만1008로
   종료되며 기존 연결은 유지됩니다. 실패 후에는 반드시 새 접속권을 받습니다.
6. Access 만료 후 기존 연결 유지와 새 발급401, Refresh 후 새 발급200을 확인합니다.
   발급 후 탈퇴·DB 장애는 ontop_dev 데이터를 변경하지 않고 격리 테스트 DB의 소유 fixture로 검증합니다.

실제 TLS 프록시의 신뢰할 forwarded header 설정과 HTTPS/WSS를 배포 환경에서 확인해야 합니다.
프록시는 브라우저 Origin을 유지해야 하며 Host와 다르다는 이유만으로 Origin을 다시 쓰지 않습니다.
접속권도 30초 Bearer 비밀이므로 프록시 access log/APM에서 `/ws/tables`의 query를 수집하지 않도록 설정합니다.
애플리케이션 access log·트레이싱·분석 도구에서도 전체 접속 URL/query와 Authorization을 기록하지 않습니다.

## 검증

LoginWebSocketFlowTests의 실제 JWT/HTTP/RawWS·29/30초 복귀 시나리오를 유지합니다. 회원 조회/경기 생성은 대역입니다.
WebSocketTicketTests는 기존 만료·동시 소비·Origin·상한을, WebSocketAuthenticationPolicyTests는 프로필 차단을 확인합니다.
MemberWebSocketAuthenticationTests는 비local 기본 인증·동시 Upgrade·연결 후 Access 만료를 실제 HTTP/소켓으로 확인합니다.
MemberWebSocketMySqlTests는 격리 MySQL에서 SSAFY/NAVER 내부 ID·제공자·발급 후 탈퇴·Repository 장애를 확인합니다.
WebSocketOriginAuthenticationTests는 실제 HTTP/RawWS로 동일/교차 Origin·내부 프록시 Host·사전 거절의 미소비·
Origin 결합 불일치·만료/재사용·JWT 및 회원 조회 각1회를 확인합니다. WebSocketOriginPolicyTests는 기존 설정의
정규화·와일드카드/비local HTTP/32개 초과 거절과 중복 Origin·Fetch Metadata를 확인합니다.
기존 익명 개발 테스트는 테스트 소스에만 local 인증 false를 명시합니다. 운영 인증 우회 API는 없습니다.

```powershell
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

2026-10-22 코드 리뷰 반영 후 최종 실행: BUILD SUCCESSFUL (5분11초). 기본 test 1,000개, flowTest 43개,
mysqlTest 121개가 통과했으며 실패·오류·건너뜀은 없습니다. flowTest는 일부 기본 테스트를 다시 실행하므로
서로 다른 테스트 수로 합산하지 않습니다. 신규 회원/프로필 검증은 각각7/3개, 신규 MySQL 검증은4개입니다.
리뷰 보완으로 Origin HTTP/핸드셰이크9개·Origin 정책10개·서비스 신뢰 경계1개, 총20개를 추가했습니다.
git diff --check도 통과했습니다. 격리 DB에서 기존 Flyway V1~V3와 JPA validate 회귀를 함께 확인했습니다.
ontop_dev는 읽기 전용으로 users/refresh_tokens 행 수·집계 지문과 Flyway 이력을 비교해 작업 전후 일치를 확인했습니다.

mysqlTest에는 기존 상점 회귀도 포함되므로 TEST_DB_*와 별개인 TEST_SHOP_DB_*도 전용 DB에 주입해야 합니다.
모두 loopback 전용 테스트 DB 접두사를 검사하며 개발 ontop_dev를 사용하지 않습니다.
이전 구현 검증에서 준비한 테스트 컨테이너와 상점 회귀용 `ontop_shop_test_auth100_20261022` DB를 재사용했습니다.
이번 코드 리뷰 보완에서 새 컨테이너·볼륨·DB는 만들지 않았습니다.
이 DB에는 테스트 fixture만 있으며 기존 DB/컨테이너/볼륨을 삭제하거나 초기화하지 않았습니다.
기존 상점 롤백 테스트는 트리거를 생성합니다. 현재 테스트 MySQL의 binary logging 환경에서는 일반 테스트 계정으로
오류1419가 발생해, TEST_SHOP_DB_*만 이 격리 컨테이너의 관리자 계정으로 주입했습니다.
애플리케이션 계정에 SUPER 권한을 추가하거나 MySQL 전역 설정을 완화하지 않았습니다.
이 자격은 자동화용 격리 DB 검증에만 사용하며 애플리케이션 실행 설정으로 사용하지 않습니다.
검증 DB는 자동 삭제하지 않습니다. 필요 없어진 뒤 사용자 확인을 받아 해당 DB만 정리합니다.
정리가 승인되면 해당 테스트 컨테이너 안에서 `DROP DATABASE ontop_shop_test_auth100_20261022`만 실행합니다.
이번 작업에서는 이 정리 명령을 실행하지 않았습니다.

브라우저 생성자는 URL과 프로토콜만 받습니다: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket). 연결 전 검증은 [Spring HandshakeInterceptor](https://docs.spring.io/spring-framework/reference/6.2/web/websocket/server.html)를 사용합니다.

채널/상점/접속권 preflight는 기존 순서를 유지합니다. 게임 엔진·Hub 메서드·재접속 정책은 변경하지 않았습니다.
자동화 통과가 실제 외부 공급자 로그인이나 배포 브라우저 검증을 뜻하지 않습니다.
