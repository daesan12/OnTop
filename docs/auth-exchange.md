# 인증 교환 및 JWT 발급 — S15P31B105-89

## API와 범위

`POST /api/v1/auth/exchange`, Content-Type `application/json`:

```json
{"exchangeCode":"<AUTH-02가 발급한 일회용 코드>"}
```

AUTH-02 인가/콜백과 동일한 JSESSIONID 쿠키가 필요하다. 요청은 exchangeCode 문자열 한 필드만 허용한다.
원래 60초 만료·세션 결합·원자적 일회 소비 정책을 그대로 사용한다.
OAuth 공급자를 다시 호출하지 않는다. 이번 공개 인증 endpoint는 이 POST와 해당 OPTIONS preflight뿐이다.

기존/복구 회원의 HTTP 200:

```json
{"status":"AUTHENTICATED","accessToken":"<Access JWT>","tokenType":"Bearer","expiresIn":1800}
```

신규 회원의 HTTP 200:

```json
{"status":"ONBOARDING_REQUIRED","onboardingToken":"<온보딩 전용 난수>","expiresIn":600}
```

신규 회원은 users INSERT·Access JWT·Refresh 발급을 수행하지 않는다.
모든 교환 응답은 `Cache-Control: no-store`, `Referrer-Policy: no-referrer`를 적용한다.
토큰 응답 DTO·내부 자격 정보의 toString은 원문을 가린다. 원문 토큰·코드·세션 ID를 로그에 기록하지 않는다.
프론트는 status별로 인증 상태를 갱신하고 온보딩 응답을 일반 로그인으로 취급하지 않아야 한다.
기존 계정 전환/로그아웃에 따른 이전 자격 폐기는 AUTH-03과 프론트에서 별도로 처리한다.

## Access JWT

Nimbus JOSE + JWT 10.10을 사용하며 Spring Security 필터 체인은 추가하지 않았다.
`AccessJwtService.issue(userId)`와 `verify(token)`이 발급·검증 경계다.

- 알고리즘 HS256 고정, JOSE typ=`at+jwt`, token_use=`access`.
- sub는 양수 내부 user ID 문자열, iss는 AUTH_JWT_ISSUER, aud는 `ontop-api`.
- iat·nbf·exp와 난수 jti를 포함한다. 수명은 1800초이며 정확히 만료 시점부터 거절한다.
- 검증 시 서명·알고리즘·typ·목적·issuer·audience·시간·주체를 검사한다.
  `alg=none`, 다른 알고리즘, 잘못된 목적·주체, 위조·미래·만료 토큰은 거절한다.
- 서명 키는 AUTH_JWT_SECRET_BASE64의 표준 Base64를 디코딩해 사용한다.
  32~128바이트, 최소 16종의 서로 다른 바이트를 요구해 짧거나 단순 반복인 키를 거절한다.
  이 검사는 난수 엔트로피를 증명하지 않는다. 반드시 CSPRNG로 생성해야 한다.
- 누락·잘못된 Base64·약한 키에는 임의 기본 키를 사용하지 않는다. Access 발급 시 500 설정 오류다.
  키가 없어도 기존 DB 없는 앱/WebSocket 개발과 OAuth 시작은 가능하다.
- 현재 단일 키다. 키 교체 시 기존 Access JWT는 무효화된다. 다중 키 순환은 별도 설계한다.

일반 REST/Wallet/Game/WebSocket 검증자는 **AccessJwtService.verify만** 사용해야 한다.
온보딩 인증을 이 메서드로 검증하면 실패한다. 이 Story는 전체 REST 필터·WebSocket 인증 연결을 구현하지 않는다.
현재 로그인 상태의 DB 재검증은 발급 시 수행한다. 발급 후 탈퇴/로그아웃에 대한 Access 무효화 정책은 후속 범위다.

근거: [Nimbus 공식 문서](https://connect2id.com/products/nimbus-jose-jwt),
[Maven Central 10.10](https://central.sonatype.com/artifact/com.nimbusds/nimbus-jose-jwt/10.10).

## 신규 회원과 USER-05 계약

온보딩 인증은 `ob_` 접두어와 256비트 SecureRandom 난수로 만든 **불투명 토큰**이다.
JWT·사용자 ID·소셜 식별자가 토큰 안에 들어가지 않는다.
서버의 OnboardingTokenStore에 토큰 SHA-256 해시, 검증된 OAuthIdentity, 만료 시각을 보관한다.
온보딩 토큰은 세션과 독립적인 일회성 Bearer 인증이며 세션 ID를 저장하거나 검증하지 않는다.

- 발급 후 600초 유효, JSESSIONID 없이 검증/소비한다.
- verify(token)은 USER-05용 검증이며 provider/providerUserId를 반환한다.
- USER-05는 claim(token)으로 한 요청만 임시 선점하고 DB 트랜잭션과 소셜키/nickname UNIQUE를 재검증한다.
- 커밋과 인증 발급 성공 시 complete(claim)로 최종 소비한다. 재사용·위조·만료·처리 중 토큰은 401이다.
- 롤백이 확인된 닉네임 409만 releaseNicknameConflict(claim)로 선점 해제한다. 최초 600초 만료는 연장하지 않는다.
  다른 실패/소셜키 중복/커밋 결과 불명은 무효화하고 새 OAuth 로그인이 필요하다. [USER-05 실패 정책](user-onboarding.md#실패-후-재시도)을 따른다.
- 이 변경은 온보딩 Bearer에만 적용한다. OAuthExchangeStore의 60초 세션 결합 교환 코드 소비/회전 정책은 유지한다.
- 최대 10,000개, 발급/검증/소비 및 30초 주기로 만료를 정리한다. 종료 시 지운다.
- 단일 인스턴스 메모리다. 재시작 시 다시 로그인해야 한다. 이미 발급된 온보딩 토큰은 OAuth 세션 상실과 독립적이다.
- JWT 서명 키를 사용하지 않는다. Access JWT용 키가 없어도 온보딩 난수 발급은 가능하다.

온보딩 확정 HTTP API는 [USER-05](user-onboarding.md)다. Authorization Bearer 토큰만으로 인증한다.
USER-05에서는 JWT 발급이 필요하므로 서명 키 설정이 필수다.

교환 시 신규 소셜키가 이미 users에 있으면 AUTH_MEMBER_STATE_CHANGED로 거절한다.
조회 이후 다른 요청에서 가입할 수 있으므로 USER-05의 UNIQUE 재검증을 생략해서는 안 된다.

## Refresh V2와 후속 AUTH-03/04 계약

`V2__create_refresh_tokens.sql`을 추가한다. V1은 변경하지 않는다.

| 컬럼 | 자료형 | 역할 |
| --- | --- | --- |
| id | BIGINT IDENTITY | PK |
| user_id | BIGINT NOT NULL | users FK, 삭제/갱신 RESTRICT |
| session_id | VARCHAR(36), ascii_bin | 로그인별 UUID, 향후 회전 계열 구분 |
| token_hash | VARCHAR(64), ascii_bin | 원문 전체의 SHA-256 hex, UNIQUE |
| created_at | TIMESTAMP(3) NOT NULL | UTC 발급 시각 |
| expires_at | TIMESTAMP(3) NOT NULL | 발급 후 7일 |
| revoked_at | TIMESTAMP(3) NULL | 폐기 시각 |

expires_at > created_at CHECK와 user/session, expiry 인덱스가 있다.
Refresh 원문은 `rt_`와 256비트 난수로 구성하며 **DB에는 저장하지 않는다**.
같은 회원도 로그인마다 다른 session UUID·해시를 발급하므로 복수 기기를 허용한다.
session_id는 10분짜리 HttpSession ID와 별개다. 향후 Refresh 갱신을 과거 HttpSession 수명에 종속시키지 않는다.

후속 API의 내부 계약:

- 원문 `rt_...`를 검증한 뒤 `OpaqueTokens.digest(raw)`로 SHA-256 해시를 계산한다.
- RefreshTokenRepository.findForUpdateByHash(hash)는 호출자 트랜잭션 안에서 사용한다.
- 현재 회원 활성 상태와 RefreshToken.isUsableAt(now)를 함께 재검증해야 한다.
- revokeSession(userId, sessionId, now)는 해당 계열의 미폐기 행만 갱신한다. 호출자 트랜잭션이 필요하다.
- 회전 시 기존 행 폐기와 같은 session_id의 새 해시 저장을 하나의 트랜잭션으로 처리하는 설계를 사용할 수 있다.
- 실제 Refresh 갱신·회전 REST API와 로그아웃 API는 구현하지 않았다.
- DB 만료/폐기 행의 보관·정리 정책과 사용자 영구 삭제는 구현하지 않았다.
  FK가 사용자 삭제를 제한하므로 향후 보존 정책과 함께 처리해야 한다.

## 트랜잭션·일회 소비·실패 정책

Origin/JSON 형식 거절은 코드를 소비하지 않는다. 유효 형식의 교환 요청은 OAuthExchangeStore.consume으로
**먼저 한 번 소비**한다. 이후 DB 비활성·서명/쿠키 설정 오류·회원 상태 변경·저장 실패도 코드를 복원하지 않는다.
재시도 대신 authorize부터 다시 시작한다.

기존 회원은 AuthExchangePersistenceService의 트랜잭션 안에서 users를 ID로 비관적 잠금 조회한다.
행 없음·탈퇴 상태·provider 불일치를 거절하고, Access 서명 후 Refresh 해시를 saveAndFlush한다.
트랜잭션 프록시의 **커밋 성공 후에만** 호출자에게 자격 정보가 반환된다.
실패 시 503과 고정 오류만 반환하며 새로운 Access 성공 응답·유효 Refresh 쿠키를 발급하지 않는다.
기존 클라이언트 쿠키는 이 실패 응답에서 변경하지 않는다.

성공 시 세션 ID를 교체해 세션 고정을 방어한다. 원래 HttpSession 속성은 유지되며 새 JSESSIONID를 사용해야 한다.
다른 탭의 이미 발급된 교환 코드는 이전 세션 ID에 묶여 실패할 수 있다. 새 로그인으로 진행한다.
발급을 마친 온보딩 토큰은 세션 회전과 무관하게 남은 유효기간 안에 사용할 수 있다.
DB 커밋과 세션 교체/HTTP 전달은 하나의 분산 트랜잭션이 아니다.
커밋 후 세션 상실·네트워크 실패가 나면 전달되지 않은 Refresh 해시 행이 남을 수 있다.
원문을 재조회하거나 교환 코드를 복원하지 않는다. 새 로그인과 후속 만료/폐기 정책으로 처리한다.

## Refresh 쿠키·Origin·CSRF

Refresh는 JSON에 포함하지 않고 `ONTOP_REFRESH` HttpOnly 쿠키로만 발급한다.
host-only, 기본 Path=/api/v1/auth, Max-Age=604800, SameSite=Lax, 기본 Secure=true다.
local에서만 HTTP 개발을 위해 Secure=false 기본값을 사용한다.
local 없는 환경에서 Secure=false는 500 설정 오류이며 SameSite=None은 항상 Secure=true를 요구한다.
운영에서는 local 프로필을 활성화하지 않는다.
Path는 `/api/v1/auth` 내부로 제한한다. 향후 갱신·삭제 API와 쿠키 제거 시 동일한 name/path를 사용해야 한다.

AuthExchangeOriginFilter는 **POST/OPTIONS /api/v1/auth/exchange에만** 적용한다.

- Origin이 있으면 AUTH_ALLOWED_ORIGINS의 정확한 scheme/host/port 목록만 허용한다.
  wildcard·null·userinfo·query·fragment는 거절한다. local 이외에는 HTTPS origin만 허용한다.
- 허용된 Origin에만 ACAO와 credentials=true를 응답한다. 전역 CORS를 완화하지 않는다.
- preflight는 POST 및 Content-Type 헤더만 허용한다. 나머지는 403 JSON 오류다.
- Origin 없는 Postman/서버 클라이언트는 세션+교환 코드+JSON으로 검증한다.
  Origin은 없는데 Sec-Fetch-Site가 cross-site/same-site인 요청은 거절한다.
- 브라우저 단순 form/text 요청은 JSON 본문 변환 단계에서 거절한다.
- 교환 코드는 256비트·세션 결합이고 URL에 넣지 않는다. 이 경계가 코드 소비 전에 CSRF 요청을 제한한다.

JSESSIONID는 HttpOnly/Secure/SameSite=Lax와 기존 Path=/api/v1/auth를 유지한다.
USER-05를 위해 넓혔던 Path=/api/v1 변경은 되돌렸다. Refresh 쿠키의 Path=/api/v1/auth도 유지한다.
같은 출처의 local POST에는 호환된다. 브라우저에서는 fetch의 credentials 설정과 실제 쿠키 전달을 확인한다.

Vercel과 API가 다른 사이트라면 다음을 배포 환경에서 함께 결정한다.

1. AUTH_ALLOWED_ORIGINS에 정확한 프론트/필요한 API Origin을 등록하고 fetch에 credentials: include를 사용한다.
2. 실제 HTTPS를 사용하며 AUTH_REFRESH_COOKIE_SAME_SITE=None, AUTH_REFRESH_COOKIE_SECURE=true를 설정한다.
3. 원래 OAuth 세션 쿠키도 POST에 필요하므로 SERVER_SERVLET_SESSION_COOKIE_SAME_SITE=None 및
   SERVER_SERVLET_SESSION_COOKIE_SECURE=true 설정을 함께 검토한다. Refresh 쿠키만 바꾸면 해결되지 않는다.
4. 브라우저의 제3자 쿠키 차단은 별도 제한이다. 같은 사이트의 사용자 지정 도메인/BFF 등 운영 구성을 검토한다.
5. Cookie·Authorization·Location·callback query·응답 본문의 토큰이 프록시/APM/HTTP 디버그 로그에 수집되지 않게 한다.

## 환경변수와 실행

| 환경변수 | 기본/조건 |
| --- | --- |
| AUTH_JWT_SECRET_BASE64 | 기본 키 없음. CSPRNG 32바이트 이상, 표준 Base64 |
| AUTH_JWT_ISSUER | ontop |
| AUTH_ALLOWED_ORIGINS | 일반 실행 빈 목록. local: http://localhost:8080,http://127.0.0.1:8080 |
| AUTH_REFRESH_COOKIE_SECURE | true, local만 false 기본값 |
| AUTH_REFRESH_COOKIE_SAME_SITE | Lax |
| AUTH_REFRESH_COOKIE_PATH | /api/v1/auth |
| DB_URL / DB_USERNAME / DB_PASSWORD | 기존 db 프로필 계약 |

개발용 서명 키 생성 예시(PowerShell 7 이상, 콘솔에 출력하지 않고 클립보드로 전달):

```powershell
$env:AUTH_JWT_SECRET_BASE64 = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
Set-Clipboard -Value $env:AUTH_JWT_SECRET_BASE64
```

IntelliJ 실행 구성의 같은 이름 환경변수 값에 붙여넣고 클립보드를 비운다.
공유 실행 구성·Git·로그·문서에 실제 키를 저장하지 않는다. 기존 IntelliJ는 다른 셸의 변수를 자동으로 받지 않는다.
앱을 재실행할 때 같은 키를 사용해야 기존 JWT를 검증할 수 있다. 비밀 관리 도구 또는 비공유 실행 구성으로 관리한다.

```powershell
Set-Clipboard -Value ''
# backend/, Java 21. DB/OAuth/JWT 환경변수는 실행 환경에서 먼저 주입한다.
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'
```

`.env`는 자동 로드하지 않는다. 온보딩은 JWT 키를 쓰지 않지만 기존 회원 JWT에는 키 설정이 필수다.
개발 DB에서 앱을 처음 실행하면 V2를 적용한다. 자동화 테스트는 개발 DB에 실행하지 않는다.

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | AUTH_INVALID_EXCHANGE_REQUEST | 누락/잘못된 JSON·형식·Content-Type |
| 401 | AUTH_INVALID_EXCHANGE_CODE | 위조·만료·재사용·세션 불일치/상실 |
| 401 | AUTH_MEMBER_STATE_CHANGED | 탈퇴·삭제·provider 불일치·신규 소셜키가 이미 가입됨 |
| 401 | AUTH_INVALID_ACCESS_TOKEN | 내부 Access 검증 실패 |
| 401 | AUTH_INVALID_ONBOARDING_TOKEN | 내부 온보딩 검증 실패 |
| 403 | AUTH_ORIGIN_NOT_ALLOWED | 허용되지 않은 Origin/preflight/Fetch Metadata |
| 500 | AUTH_TOKEN_CONFIGURATION_ERROR | 서명 키/issuer/쿠키/Origin 설정 오류 |
| 503 | AUTH_EXCHANGE_STORAGE_UNAVAILABLE | db 비활성 또는 저장/커밋 장애 |
| 503 | AUTH_ONBOARDING_CAPACITY_EXCEEDED | 온보딩 저장 용량 초과 |

외부 응답은 기존 code/message 두 필드다. 원인 예외·SQL·원문 인증 정보는 반사하지 않는다.

## 자동화 검증

```powershell
# TEST_DB_URL / TEST_DB_USERNAME / TEST_DB_PASSWORD를 별도 테스트 DB로 주입한 뒤
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

기본 test에는 mysql 태그가 제외된다. mysqlTest는 loopback의 ontop_users80_test_ 접두어 DB만 허용한다.
기존 AUTH 테스트 DB를 재사용하며 사용자/Refresh fixture는 테스트 DB에만 보존한다.
개발 DB ontop_dev에는 테스트·초기화·삭제를 실행하지 않는다.

- AuthTokenSecurityTests: HS256 서명·만료·목적·키, 온보딩 분리·만료·동시 소비·용량, 쿠키 보안.
- AuthExchangeControllerTests: 두 회원 유형·신규·JSON·코드 공격·동시 교환·Origin/CORS,
  저장 실패·서명 실패·flush 후 커밋 실패 시 코드 재사용 금지와 비노출.
- AuthExchangeMySqlTests: V2·FK·JPA validate·재실행·해시·복수 기기·상태 변경·저장 실패.
  Mock 공급자로 실제 HTTP authorize→callback→exchange와 세션 쿠키 유지/교체도 확인한다.
- 기존 AUTH-01/02·WebSocket/flowTest를 함께 실행한다. 실제 공급자 로그인 성공과는 구분한다.

### 실제 검증 기록

2026-10-21, `feat/S15P31B105-89-auth-exchange`, Java 21에서 다음 명령을 실행했다.

`./gradlew.bat clean build flowTest mysqlTest --console=plain`

| 항목 | 결과 |
| --- | --- |
| clean build / 기본 test | 343개 통과, 실패·오류·건너뜀 0 |
| flowTest | 실제 WebSocket 흐름 2개 통과 |
| mysqlTest | MySQL 8.4.11에서 42개 통과, 교환 관련 신규 테스트 10개 포함 |
| V2 / JPA | V2 적용·FK·해시 저장·ddl-auto=validate 성공 |
| Flyway 재실행 | 현재 버전 2, 추가 적용 0개, 사용자/Refresh 행 수 유지 |
| git diff --check | 통과 |

기존 `ontop-auth61-test-20261021-073629-ac72f0` 컨테이너를 재사용했다.
DB는 `ontop_users80_test_auth61_20261021_073629_ac72f0`, loopback 포트는 49701이다.
신규 컨테이너·볼륨은 만들거나 삭제하지 않았다.
auth89- 접두어 소셜 식별자를 가진 사용자와 Refresh fixture는 이 테스트 DB에만 남긴다.
개발 DB ontop_dev는 users 행 수·데이터 체크섬·V1 체크섬과 적용 시각이 작업 전후 동일했다.
개발 DB에 V2를 적용하거나 테스트 데이터를 넣지 않았다. 다음 개발 앱 실행 시 Flyway가 V2를 추가 적용한다.
보고서는 `backend/build/reports/tests/{test,flowTest,mysqlTest}/index.html`에 있다.
Mockito의 Java agent 경고는 있었지만 빌드/테스트 실패는 없었다.

## 브라우저·Postman 수동 테스트

1. local,db와 DB·SSAFY·JWT 환경변수를 설정한다. callback을 JSON으로 보려면 AUTH_FRONTEND_CALLBACK_URI를 비운다.
   기존 회원은 가입 완료된 별도 개발 계정을 사용한다. 이번 API에는 회원 생성 endpoint가 없다.
2. 브라우저 최상위에서 http://localhost:8080/api/v1/auth/ssafy/authorize로 이동해 **담당자가 직접** 로그인한다.
   실제 코드·쿠키·토큰을 문서·채팅·스크린샷·Postman 공유 환경에 남기지 않는다.
3. callback의 exchangeCode를 발급 후 60초 안에 사용한다. 브라우저 개발자 도구에서 해당 API 호스트의
   JSESSIONID를 확인하고 Postman의 같은 localhost 호스트 cookie jar에 로컬로만 설정한다.
   세션 Path=/api/v1/auth이며 localhost와 127.0.0.1을 혼용하지 않는다. HttpOnly 쿠키는 JS로 읽지 않는다.
4. POST http://localhost:8080/api/v1/auth/exchange, JSON body에 exchangeCode만 넣는다.
   Postman 자동 redirect·콘솔/네트워크 기록·응답 자동 저장 및 공유를 끈다. Origin은 생략하거나 허용 목록의 값만 쓴다.
5. 기존/복구 회원: AUTHENTICATED, expiresIn=1800과 Access JWT가 기대된다.
   Set-Cookie의 ONTOP_REFRESH에 HttpOnly·Path·Max-Age·SameSite가 있는지 값은 가리고 확인한다.
   local HTTP에서는 Secure=false, HTTPS 운영에서는 Secure여야 한다. Refresh는 JSON에 없어야 한다.
6. 신규: ONBOARDING_REQUIRED, expiresIn=600과 ob_ 전용 토큰만 기대된다.
   이 교환만으로 새로운 Refresh는 발급되지 않고 users가 늘지 않는다. 이후 [USER-05](user-onboarding.md)로 가입한다.
7. OAuth 교환의 세션 ID 회전 정책은 유지한다. 이후 USER-05는 발급된 온보딩 Bearer로 호출하며 JSESSIONID는 필요 없다.
8. 같은 코드를 다시 보내거나 60초 이후 처음 보내면 401이다. 다른 cookie jar로 시도해도 401이고,
   원래 세션의 유효 코드는 다른 세션의 오입력 때문에 소진되지 않는다.
9. Origin 위조는 403, 본문 누락/잘못된 JSON은 400이다. DB/발급 실패 뒤에는 authorize부터 다시 시작한다.
10. Refresh 갱신·로그아웃 HTTP endpoint는 아직 없다. 테스트 편의용 우회 API를 추가하지 않는다.

Access JWT는 외부 JWT 사이트에 붙여넣지 않는다. PowerShell 7 이상에서 아래 예시로 서명과 핵심 클레임을 확인할 수 있다.
서명 키는 앞에서 주입한 같은 AUTH_JWT_SECRET_BASE64를 사용한다. 토큰은 보안 입력으로 받고 값은 출력하지 않는다.

```powershell
$tokenText = [System.Net.NetworkCredential]::new('', (Read-Host 'Access JWT' -AsSecureString)).Password
$jwtParts = $tokenText.Split('.')
function ConvertFrom-LocalBase64Url([string]$text) {
    $encoded = $text.Replace('-', '+').Replace('_', '/')
    [Convert]::FromBase64String($encoded.PadRight($encoded.Length + (4 - $encoded.Length % 4) % 4, '='))
}
$mac = [System.Security.Cryptography.HMACSHA256]::new([Convert]::FromBase64String($env:AUTH_JWT_SECRET_BASE64))
try {
    $expected = $mac.ComputeHash([Text.Encoding]::ASCII.GetBytes($jwtParts[0] + '.' + $jwtParts[1]))
    $signatureValid = [System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals($expected, (ConvertFrom-LocalBase64Url $jwtParts[2]))
    $header = [Text.Encoding]::UTF8.GetString((ConvertFrom-LocalBase64Url $jwtParts[0])) | ConvertFrom-Json
    $claims = [Text.Encoding]::UTF8.GetString((ConvertFrom-LocalBase64Url $jwtParts[1])) | ConvertFrom-Json
    [pscustomobject]@{ SignatureValid=$signatureValid; AlgorithmValid=($header.alg -eq 'HS256'); TypeValid=($header.typ -eq 'at+jwt'); PurposeValid=($claims.token_use -eq 'access'); SubjectValid=($claims.sub -match '^[1-9][0-9]*$'); LifetimeSeconds=($claims.exp-$claims.iat); NotExpired=($claims.exp -gt [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) }
} finally {
    $mac.Dispose()
    Remove-Variable tokenText, jwtParts, expected, header, claims -ErrorAction SilentlyContinue
}
```

위 예시는 수동 핵심 확인용이다. 앱의 정식 검증은 issuer/audience/시간 조건도 확인하는 AccessJwtService.verify다.
서명키를 안전하게 PS에 주입할 수 없다면 수동 서명 확인 대신 해당 컴포넌트의 자동화 테스트를 사용한다.

## 남은 운영 결정

AUTH-03 로그아웃·AUTH-04 회전/갱신, 분산 온보딩 저장, 만료 행 보관/정리,
전체 REST/WebSocket 검증 연결, 요청량 제한, 실제 Vercel/TLS/브라우저 쿠키 검증은 후속 범위다.
SSAFY/NAVER 실제 로그인은 이번 자동화 작업에서 수행하지 않는다. 기존 공급자 검증 범위를 유지한다.
