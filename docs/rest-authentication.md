# REST Access JWT 인증·인가 (S15P31B105-99)

## 구조와 책임

Spring Boot가 관리하는 Security / OAuth2 Resource Server starter를 사용한다.
Boot 3.5.16의 이번 의존성 해석 결과는 Spring Security 6.5.11이다. Security 버전을 별도로 고정하지 않는다.

```text
보호 REST 요청
  → StrictBearerTokenResolver (Authorization 하나만 허용, 쿼리/본문/쿠키 인증 불가)
  → BearerTokenAuthenticationFilter / JwtAuthenticationProvider
  → AccessJwtDecoder → 기존 AccessJwtService.verifyAccess()
  → AccessAuthenticationService.requireActive(검증된 JWT subject, sid)
  → JpaActiveMemberLookup → users 활성 상태 + Refresh 로그인 계열 활성 상태 조회
  → Authentication(AuthenticatedUser, ROLE_MEMBER) → SecurityContext → Controller
```

`AccessJwtDecoder`는 기존 검증 서비스를 호출한 뒤 검증된 클레임을 Spring Jwt 표현으로 변환한다.
HS256 서명·exp/iat/nbf·Issuer·Audience·Header typ·token_use·crit·최대 수명·양수 내부 subject 검증은
`AccessJwtService.verifyAccess()`가 담당한다. S15P31B105-113에서 sid를 추가하고30분 수명은 유지한다.
컨텍스트의 credentials는 null이며 Principal의 toString은 식별자를 출력하지 않는다.
토큰이나 Authentication 전체를 애플리케이션 로그에 기록하지 않는다.

| 체인 | 경로 | 인증·세션 정책 |
| --- | --- | --- |
| 순서 0 | `/api/v1/users/nickname-availability` | 전용 혼합 Bearer 검증. [USER-04](nickname-availability.md)의 서비스가 온보딩 또는 Access 인증을 필수 수행 |
| 순서 1 | 아래 명시적 공개/별도 인증 경로 | Resource Server 없음. 기존 별도 검증 유지. Security는 세션을 생성하지 않으며 애플리케이션의 OAuth 세션 생성/조회/ID 회전은 허용 |
| 순서 2 | 그 외 모든 경로 | Stateless Bearer 인증 + 매 요청 활성 회원 조회. 관리 경로는 인증 후에도 denyAll |

세 체인 모두 NullSecurityContextRepository를 사용한다. HttpSession에 SecurityContext를 저장하거나
기존 세션의 인증을 REST 인증으로 읽지 않는다. 별도 인증 체인의 Servlet API 래핑을 비활성화하여
기존 WebSocket 인증 필터가 제공하는 Servlet Principal도 덮어쓰지 않는다.
일반 REST를 위한 별도 ThreadLocal은 만들지 않는다.
보안 체인 설정은 Servlet 애플리케이션에서만 등록한다. HTTP 서버가 없는 기존 DB/서비스 진단 컨텍스트에는
HttpSecurity를 요구하지 않으며, 실제 Servlet 서버에서는 프로필과 관계없이 이 접근 정책을 적용한다.

## 현재 매핑과 접근 정책

아래 목록은 `src/main/java`의 실제 Controller 매핑이다. HEAD는 Spring MVC의 GET 처리 규칙을 따른다.
공개 체인은 경로를 열고 HTTP 메서드/입력/공급자 검증은 기존 Controller/필터가 담당하므로 기존 400/405 계약을 유지한다.

| 메서드/경로 | 접근 정책 | 실제 검증 또는 제한 |
| --- | --- | --- |
| GET `/api/v1/minigames/bungeoppang/rankings` | **Access JWT + 활성 회원/로그인 세션** | v4/v5 개인 최고 전체 랭킹·본인 순위. [계약](bungeoppang-rankings-api.md). 기존 인증 로직 유지 |
| GET `/api/v1/rankings/park` | **Access JWT + 활성 회원/로그인 세션** | 최신 dev의 공원 랭킹 스냅샷 조회. [계약](park-ranking-api.md) |
| GET `/api/v1/auth/{provider}/authorize` | 공개 | ssafy/naver, 신뢰된 callback 설정, 서버 state 발급 |
| GET `/api/v1/auth/{provider}/callback` | 별도 인증 | OAuth 세션·provider·state, 공급자 조회, 회원 상태 |
| POST `/api/v1/auth/exchange` | 별도 인증 | exchangeCode + 같은 OAuth 세션, 일회 소비/세션 ID 회전, 기존 Origin 검증 |
| POST `/api/v1/auth/refresh` | 별도 인증 | ONTOP_REFRESH + 허용 Origin, DB Rotation |
| POST `/api/v1/auth/logout` | 별도 인증 | ONTOP_REFRESH + 허용 Origin, 현재 로그인 계열 폐기 |
| POST `/api/v1/users/onboarding` | 별도 인증 | 독립 ob_ Bearer, 최초 600초 만료, 선점·409 재시도·성공 확정, 기존 Origin 검증 |
| GET `/api/v1/users/me` | **Access JWT + 활성 회원/로그인 세션** | Principal의 내부 userId로 본인 프로필 조회. [USER-01](user-me.md) |
| PATCH `/api/v1/users/me` | **Access JWT + 활성 회원/로그인 세션** | Principal의 본인 닉네임만 수정. 최종 UNIQUE 검증. [USER-02](user-nickname-update.md) |
| DELETE `/api/v1/users/me` | **Access JWT + 활성 회원/로그인 세션** | 본인 Soft Delete·전 계열 폐기·커밋 후 전체 연결 종료. [USER-03](user-withdrawal.md) |
| GET `/api/v1/users/nickname-availability` | 온보딩 Bearer 또는 Access JWT | 닉네임 사전 조회, 본인 제외·DB collation 기준. [USER-04](nickname-availability.md) |
| GET `/api/v1/wallets/me` | **Access JWT + 활성 회원/로그인 세션** | 본인 잔액 조회. [WALLET](wallet-balance.md) |
| GET `/api/v1/wallets/me/transactions` | **Access JWT + 활성 회원/로그인 세션** | 본인 원장의 거래 ID 커서 조회. [WALLET](wallet-transactions.md) |
| GET `/api/v1/channels` | **Access JWT + 활성 회원** | local/dev 및 운영 prod,db에서 등록. 채널 목록 조회 |
| GET `/api/v1/tables` | **Access JWT + 활성 회원** | local/dev 및 운영 prod,db에서 등록. 채널 설정 시 channelId 필요 |
| POST `/api/v1/minigames/sessions` | **Access JWT + 활성 회원** | local/dev 및 운영 prod,db에서 등록. Idempotency-Key 필수, 미니게임 서비스는 별도 활성화 |
| POST `/api/v1/minigames/skewer/admissions` | **Access JWT + 활성 회원/로그인 세션** | 본인 고정 이용료 10냥·단일 Idempotency-Key·본문 없음. 기존 원장으로 중복 차감 방지. [계약](skewer-admissions.md) |
| GET `/api/v1/minigames/jumpmap/rankings` | **Access JWT + 활성 회원/로그인 세션** | 점프맵 현 규칙의 개인 최고 상위 50명·본인 기록. [계약](jumpmap-repeat-play.md) |
| GET `/api/v1/minigames/sessions` | **Access JWT + 활성 회원** | 본인 오늘 획득·규칙 버전 상태 조회 |
| GET `/api/v1/minigames/sessions/{sessionId}` | **Access JWT + 활성 회원** | 본인 세션만 조회 |
| POST `/api/v1/minigames/sessions/{sessionId}/deliveries` | **Access JWT + 활성 회원** | v4 납품 승인. Idempotency-Key 필수, 엄격한 JSON 본문·256KB 제한, 본인 진행 판만 |
| POST `/api/v1/minigames/sessions/{sessionId}/manual-pause` | **Access JWT + 활성 회원** | 본인 v4/v5 판의 F1 설명서 정지·재개. `paused`·`expectedPauseRevision` 필수, 낡은 상태 변경은 409 |
| POST `/api/v1/minigames/sessions/{sessionId}/complete`, `/abandon` | **Access JWT + 활성 회원** | 엄격한 빈 JSON 본문. 서버 검증 없는 완료/지급 차단 |
| GET `/dev/tables` | 공개 개발 페이지 | local에서만 등록됨 |
| GET `/dev/world-config` | 공개 개발 설정 | local에서만 등록됨. 기존 WebSocket 인증 모드에서는 404 |
| GET `/actuator/health`, 하위 health 경로 | 공개 | 기존 상태만 공개, 상세 정보는 never |
| POST `/api/v1/auth/websocket-ticket` | Access JWT + 활성 회원 | S15P31B105-100에서 공통 회원 인증과 연결. 최대30초 1회용 접속권 |
| `/ws/tables` | 별도 접속권 인증 | Servlet 환경에서 기존 Interceptor에 위임. URL에 Access JWT를 받지 않음 |

`/actuator/**` 중 health를 제외한 경로는 익명 401, 정상 회원 403이다.
Actuator 노출 설정 자체도 기존 health 전용을 유지한다.
현재 운영 소스에 게임 REST Controller와 일반 회원가입 API는 없다.
새 REST 경로는 기본적으로 ROLE_MEMBER를 요구한다. 새 공개 경로가 필요하면 명시적으로 검토해 등록해야 한다.
없는 경로도 인증 전에 401을 받을 수 있으며, 인증 후에는 MVC의 기존 404/405가 적용된다.
ERROR dispatch는 기본 오류 응답을 보존하도록 별도 체인에서 처리하며 MVC 오류 페이지를 새 API로 만들지 않는다.

### 테스트 전용 데모

`GamesDemoApplication`, `OmokDemoApplication`과 `DemoSecurityConfiguration`은 전부 테스트 소스다.
해당 Fixture를 명시적으로 사용하는 테스트/Gradle 데모 실행에만 별도 공개 체인을 추가한다.
운영 bootJar에는 포함되지 않고, 운영 프로필에 인증 우회 조건을 추가하지 않는다.

| 테스트 전용 경로 | 메서드 |
| --- | --- |
| `/dev/games`, `/dev/games/games.js`, `/dev/games/games.css`, `/dev/games/config` | GET |
| `/dev/games/matches`, `/dev/games/forfeit` | POST (기존 데모 전용 검증 유지) |
| `/dev/omok`, `/dev/omok/omok.js`, `/dev/omok/omok.css`, `/dev/omok/config` | GET |
| `/dev/omok/games` | POST (기존 데모 전용 검증 유지) |

기존 세션 왕복 테스트의 `/api/v1/auth/naver/state-test-callback` 역시 해당 테스트에서만 등록/허용한다.
광장·테이블 REST 회귀 테스트는 실제 서명 JWT를 전송하고 회원 조회만 테스트 Fixture로 대체한다.
실제 DB 활성/탈퇴 판정은 별도 mysqlTest가 검증한다.

## 프론트 인증 정보 전달

일반 보호 REST는 Access JWT를 Authorization에만 전달한다. Refresh 쿠키, JSESSIONID,
query의 userId/access_token, X-User-Id, 닉네임을 인증 수단으로 받지 않는다.

```http
GET /api/v1/channels HTTP/1.1
Authorization: Bearer <메모리에 보관한 Access JWT>
```

```javascript
// accessToken은 인증 교환/온보딩/재발급 결과에서 얻은 값이다. 콘솔에 출력하지 않는다.
await fetch(`${apiBase}/api/v1/tables?channelId=${encodeURIComponent(channelId)}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
  credentials: 'omit'
});
```

보호 REST의 cross-origin CORS는 기존 AUTH_ALLOWED_ORIGINS의 정확한 출처만 허용하고,
Authorization/Content-Type 헤더와 GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS만 허용한다.
Preflight는 JWT 없이 처리하며 credentials는 허용하지 않는다. 보호 REST에는 위 예시처럼 `omit`을 사용한다.
동일 출처 기본 fetch가 쿠키를 동반하더라도 쿠키는 REST 인증에 쓰이지 않는다.

쿠키를 주고받는 exchange/refresh/logout/onboarding은 기존 Origin 필터의 명시적 출처·
Allow-Credentials 정책을 그대로 사용한다. 프론트는 해당 요청에 `credentials: 'include'`를 사용한다.
온보딩은 JSESSIONID 없이 ob_ Bearer만으로 진행하지만 성공 Refresh 쿠키 수신을 위해 include가 필요하다.
OAuth authorize/callback은 기존 브라우저 페이지 이동을 사용한다.
공개/별도 인증 경로에서는 임의 Authorization을 일반 Access JWT로 해석하지 않는다.

REST 체인은 쿠키 인증을 받지 않아 Spring CSRF 토큰을 요구하지 않는다. 기존 쿠키 인증 POST의
Origin/Fetch Metadata 및 코드/토큰 검증은 유지한다. 4개 Origin 필터는 통합하지 않았다.
잘못된 Origin/preflight는 토큰 소비나 DB 변경 전에 거절된다.

## Principal과 팀원 재사용 계약

Controller에서는 다음처럼 내부 ID를 얻는다. 아래 예시는 사용 방법이며 신규 운영 API는 아니다.

```java
void handle(@AuthenticationPrincipal AuthenticatedUser user, Authentication authentication) {
    long userId = user.userId();
    boolean authenticated = authentication.isAuthenticated();
}
```

Principal은 `com.ssafy.ontop.auth.security.AuthenticatedUser(userId, loginProvider)`다.
Authentication.getName()은 검증된 내부 userId 문자열이고, 모든 정상 회원에게 ROLE_MEMBER를 부여한다.
세부 게임/좌석/턴/관전 권한은 이 역할로 판정하지 않으며 담당 도메인이 별도로 검증해야 한다.
Service에 ID를 전달할 때는 요청 본문의 임의 ID 대신 이 인증 결과를 사용한다.

HTTP 이외의 후속 연결은 `AccessAuthenticationService.authenticate(rawAccessToken)`으로
기존 JWT 검증과 현재 활성 회원 조회를 함께 수행하고 AuthenticatedUser를 받을 수 있다.
`requireActive(id, sid)`는 이미 검증된 회원/로그인 계열에만 사용한다. 클라이언트의 임의 ID를 인증하지 않는다.

### WebSocket 인계

S15P31B105-100에서 MR !14의 접속권 구조와 공통 회원 인증을 연결했다.
접속권 발급은 보호 체인의 JWT 검증·requireActive() 조회를 각각 한 번 수행한다. 기존 AuthenticatedUser Principal과
검증된 만료를 담은 Authentication.details(AuthenticatedAccess)를 서비스에서 재사용한다.
VerifiedWebSocketUser.from()으로 매핑하고, 연결 때 requireActive(id, sid)를 다시 호출하는 어댑터로
회원과 로그인 계열을 재확인한다. 새로운 접속권 저장소나 JWT 검증 알고리즘은 만들지 않았다.
회원 없음/탈퇴는 401, 연결 시 DB 장애는 503으로 구분한다.

브라우저는 보호 POST로 최대30초 1회용 접속권을 받은 뒤 `/ws/tables?ticket=...`으로 연결한다.
Access JWT를 URL에 추가하거나 WebSocket 임의 Authorization 헤더를 가정하지 않는다.
REST SecurityContext는 요청 종료 후 정리되며 기존 VERIFIED_USER 세션 속성/Hub 계약을 그대로 사용한다.
인증 기본값은 true이고 false는 명시적 local(+db/visual-test) 개발 조합에서만 허용한다.
S15P31B105-113의 로그인 계열 매핑·커밋 후 종료를 USER-03 탈퇴 API에서도 재사용한다.
전달 방식·실제 회원 테스트·프로필 변경 범위는 [WebSocket 인증 계약](websocket-authentication.md)을 따른다.

## 오류와 보안 헤더

모든 신규 Security 오류 본문은 `{ "code": "...", "message": "..." }`다.
토큰, ID, DB 연결 정보, 예외 원문을 포함하지 않는다. 401은 WWW-Authenticate: Bearer를 포함한다.
오류와 기존 민감 응답의 Cache-Control: no-store를 유지한다. Spring 기본 보안 헤더도 적용한다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | AUTH_AUTHENTICATION_REQUIRED | Authorization 없음 |
| 401 | AUTH_INVALID_ACCESS_TOKEN | 형식/중복 헤더, 위조·만료·잘못된 토큰 종류/서명/클레임 |
| 401 | AUTH_MEMBER_STATE_CHANGED | users에 없거나 deleted_at이 NULL이 아님 |
| 403 | AUTH_ACCESS_DENIED | 인증됐지만 접근 권한 없음 (현재 비공개 관리 경로) |
| 403 | AUTH_ORIGIN_NOT_ALLOWED | 허용 출처/메서드/헤더가 아닌 CORS 요청 |
| 403 | AUTH_REQUEST_REJECTED | Security HTTP 방화벽에서 거절한 요청 형식 |
| 503 | AUTH_MEMBER_LOOKUP_UNAVAILABLE | DB 프로필/회원 조회 공급자 없음, DB 조회/트랜잭션 장애 |
| 500 | AUTH_TOKEN_CONFIGURATION_ERROR | 기존 서명 키/Issuer 또는 출처 설정 오류 |

JWT 인증 실패에는 DB를 조회하지 않는다. 정상 JWT도 매 요청 읽기 전용 트랜잭션으로 users를 조회한다.
탈퇴 직후의 **다음 요청**은 거절된다. 이미 활성 판정이 끝난 실행 중 요청까지 취소하지는 않는다.

## 실행과 Postman 수동 검증

새 환경변수는 없다. DB_URL/DB_USERNAME/DB_PASSWORD, AUTH_JWT_SECRET_BASE64,
AUTH_JWT_ISSUER, AUTH_ALLOWED_ORIGINS는 기존 설정을 사용한다. .env는 Boot가 자동 로드하지 않으므로
IntelliJ Run Configuration 또는 실행 프로세스에 별도 주입한다. 실제 비밀값은 문서/스크립트/Git에 넣지 않는다.

```powershell
cd backend
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'
```

1. 기존 실제 소셜 로그인 → callback → 동일 세션 exchange 또는 온보딩을 완료하여 활성 회원 Access를 얻는다.
   Refresh 쿠키를 그대로 유지하고, 토큰은 Postman 로컬 변수로만 사용한다. 공유 컬렉션/콘솔/보고서로 내보내지 않는다.
2. `GET /api/v1/channels` 또는 `/api/v1/tables`에 Bearer Access를 전송한다.
   채널 설정이 있으면 tables에 유효한 channelId를 전달한다. 인증 후 200/도메인 오류를 확인한다.
3. Authorization 제거 → 401 REQUIRED, 임의 문자열/온보딩 토큰/변조 서명 → 401 INVALID를 확인한다.
   만료 검증은 별도 로컬 토큰이 실제 30분 지난 뒤 수행한다. 서명 키를 공유하거나 수명 정책을 바꾸지 않는다.
4. Access를 유지한 채 로그아웃 → 204, Refresh 재발급 → 401, 같은 sid의 기존 Access → 401을 확인한다.
5. 탈퇴 판정은 개발 ontop_dev 데이터를 임의 수정하지 않고 격리 MySQL 테스트의 소유 fixture로 검증한다.
   존재하지 않는 ID·deleted_at 값이 있는 회원은 401 MEMBER_STATE_CHANGED여야 한다.
   Postman에서도 확인하려면 별도 Run Configuration을 전용 `ontop_users80_test_*` DB에 연결하고 정상 OAuth/
   온보딩으로 직접 만든 검증 회원의 Access를 보관한다. 연결 DB 이름을 확인한 후 그 회원의 deleted_at만
   설정하고 동일 Access로 보호 GET을 다시 호출하여 401을 확인한다. 이 절차를 ontop_dev나 타인 계정에 적용하지 않는다.
6. 브라우저 또는 Postman으로 허용 Origin의 OPTIONS + Access-Control-Request-Method: GET +
   Access-Control-Request-Headers: Authorization → 200, 미허용 Origin → 403을 확인한다.
   Postman은 브라우저 CORS를 강제하지 않으므로 실제 프론트에서도 확인해야 한다.
7. 보호 경로에 정상 Access를 붙여 `/actuator/metrics` → 403, health는 토큰 없이 상태만 반환하는지 확인한다.

DB 없는 기본/local 실행은 계속 시작된다. 익명 WebSocket 개발은 local에서 authenticated=false를 명시한다.
보호 REST는 DB 없는 상태에서
무인증 401, 정상 JWT + 회원 조회 불가 503으로 안전하게 실패한다. DB 없이 보호 REST를 공개하지 않는다.
`/dev/tables` 페이지 자체와 WebSocket은 유지되지만 기존 페이지의 **목록 새로고침** fetch에는 Bearer가 없으므로
새 정책에서 401이다. 팀원 페이지는 수정하지 않았으며, 정식 UI의 Access 헤더 연결이 후속 작업이다.
Postman에서 해당 REST를 별도로 검증할 수 있다. 테스트 전용 gamesDemo/omokDemo의 경로는 기존대로 유지한다.

## 자동화와 배포 확인

```powershell
# TEST_DB_*는 ontop_dev와 다른 loopback의 ontop_users80_test_* DB에만 주입한다.
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

테스트 DB URL은 코드에서 전용 접두사/loopback을 검사한다. 기존 V1/V2/V3 및 ddl-auto=validate를 그대로 사용한다.
새 마이그레이션은 없다. 자동화 테스트는 개발 DB를 사용하지 않는다.

### 2026-10-22 최종 자동화 결과

`clean build flowTest mysqlTest --console=plain` 성공, `git diff --check` 성공.

| 작업 | 테스트 수 | 실패/오류/건너뜀 |
| --- | --- | --- |
| test | 902 | 모두 0 |
| flowTest | 17 | 모두 0 |
| mysqlTest | 99 | 모두 0 |

각 작업 기준이며 flow 시나리오는 기본 테스트와 중복 실행된다. 신규 인증 검증 사례는 총 50개다.
웹 서버 없는 기존 DB 진단 테스트에서 HttpSecurity 빈을 요구하던 문제를 Servlet 조건으로 수정한 뒤
전체 명령을 다시 실행했다. MySQL 테스트는 기존 격리 컨테이너를 재사용했고 새 컨테이너/볼륨을 만들지 않았다.
개발 ontop_dev는 읽기 전용으로 행 수·집계 지문·Flyway 이력을 비교하여 작업 전후 동일함을 확인했다.
운영 JAR에 테스트용 인증/Principal 확인 컨트롤러나 데모 보안 설정이 포함되지 않는 것도 확인했다.
실제 공급자 로그인 및 배포 브라우저 검증을 수행했다는 의미는 아니다.

배포 전 확인할 사항:

- 실제 HTTPS 프론트 Origin(스킴/호스트/포트)을 AUTH_ALLOWED_ORIGINS에 명시한다. 와일드카드는 허용하지 않는다.
- 기존 Refresh/Security 세션 쿠키의 Secure=true, HttpOnly, SameSite와 실제 사이트 배치를 확인한다.
  교차 사이트 쿠키가 필요하면 SameSite=None + Secure 및 브라우저 제3자 쿠키 제한을 별도 검증한다.
- 보호 REST는 credentials omit, 쿠키 인증 API는 include로 프론트 클라이언트를 구분한다.
- HTTPS 종료 프록시의 신뢰 범위와 forwarded header 처리, 브라우저 보안 헤더를 실제 환경에서 검증한다.
- 운영에 local/데모 프로필을 켜지 않는다. 광장/테이블 Controller의 local 제한 해제는 이번 작업에서 하지 않았다.
- Authorization/Cookie/쿼리의 OAuth code를 프록시·APM·TRACE 로그에 기록하지 않는다.
- 보호 REST는 매 요청 DB에 의존한다. DB 장애는 인증 우회 없이 503이다. 캐시/성능 최적화는 별도 검토한다.

로그아웃은 같은 sid의 Refresh 로그인 계열과 Access 인증을 차단한다. 탈퇴 회원도 DB 상태로 차단한다.
sid 없는 기존 JWT는 Refresh 또는 OAuth로 새로 발급받아야 한다. 프론트는 로그아웃 후 메모리 Access를 삭제한다.
JWT 블랙리스트는 없으며, 커밋 전 인증된 진행 중 REST 요청은 소급 취소하지 않는다.
상세 계약은 [로그인 세션 무효화](session-invalidation.md)를 따른다.

구조 참고: [Spring Security JWT Resource Server](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/resource-server/jwt.html),
[SecurityFilterChain](https://docs.spring.io/spring-security/reference/6.5/servlet/architecture.html),
[Session management](https://docs.spring.io/spring-security/reference/6.5/servlet/authentication/session-management.html).
