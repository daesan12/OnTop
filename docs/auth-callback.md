# 소셜 로그인 콜백 — S15P31B105-61 AUTH-02

## 범위와 API

`GET /api/v1/auth/{provider}/callback`에서 `ssafy`, `naver`만 지원한다.
원래 HttpSession의 state를 provider와 함께 일회 검증한 뒤 서버에서 토큰·프로필을 조회한다.
검증된 소셜 식별자로 회원 상태를 판별하고 **60초짜리 일회용 교환 코드**를 발급한다.
이 코드와 세션 쿠키만으로 서비스 REST/WebSocket에 로그인한 것은 아니다.
JWT 발급·교환 REST API·신규 users 생성·온보딩·로그아웃은 이번 범위에 없다.
이 경계는 AUTH-02의 범위다. 이후 S15P31B105-89에서 추가한
[POST 인증 교환 API](auth-exchange.md)는 이 콜백의 교환 코드와 같은 세션을 사용한다.

프론트 주소가 아직 없으므로 `AUTH_FRONTEND_CALLBACK_URI`는 기본적으로 비어 있다.
미설정 시의 HTTP 200 JSON은 **로컬 수동 테스트를 위한 개발 검증용 계약**이며 아래 두 필드만 포함한다.
현재 코드는 이 분기를 local 프로필로 제한하지 않는다. 운영 프론트 연동 전에는 신뢰된
`AUTH_FRONTEND_CALLBACK_URI`와 후속 교환 API 계약을 확정해야 한다.
이 JSON 응답으로 HTTP 교환 코드 소비나 JWT 발급까지 완료되는 것은 아니다.

```json
{"exchangeCode":"<일회용 불투명 코드>","expiresIn":60}
```

프론트 주소를 구성하면 HTTP 302로 해당 주소의 `#exchange_code=<일회용 코드>`에 전달한다.
query가 아닌 fragment를 사용하며 JWT·OAuth 토큰·소셜 식별자·회원 상태·사용자 ID는 전달하지 않는다.
프론트는 fragment를 읽은 뒤 `history.replaceState`로 주소에서 제거하고 로그·분석 도구에 보내지 않아야 한다.
요청의 `redirect_uri`, `returnUrl` 등은 목적지를 변경하지 못한다.
성공·오류 응답은 `Cache-Control: no-store`다. 콜백 응답에는 `Referrer-Policy: no-referrer`도 지정한다.
오류는 외부 주소로 리다이렉트하지 않고 기존 `code`, `message` JSON 계약을 사용한다.

## state와 세션

AUTH-01의 `NaverStateStore`를 provider 구분이 가능한 `OAuthStateStore`로 교체했다.
이제 SSAFY와 NAVER 인가 요청 모두 서버가 생성한 state를 포함한다.

- SecureRandom 32바이트, Base64 URL-safe/no padding, 43자다. 서버에는 SHA-256 해시를 저장한다.
- HttpSession에 `(state 해시, provider, 만료 시각)`을 보관하며 유효기간은 5분이다.
- 같은 세션에서 두 provider를 합쳐 최대 10개의 시도를 보관한다. 초과하면 가장 오래된 시도를 제거한다.
- 세션·provider·state가 일치해야 원자적으로 소비한다. 다른 세션/provider로는 소비되지 않는다.
- 누락·불일치·만료·재사용은 외부 토큰 교환 전에 거절한다. 검증 실패 시 새 세션을 만들지 않는다.
- 공급자 오류 callback도 유효한 state를 먼저 소비한다. 토큰·프로필 실패 시에도 state는 재사용할 수 없다.
- state/code/error의 중복 쿼리, code와 error의 동시 전달, code 누락도 거절한다.

쿠키는 host-only, Path=`/api/v1/auth`, HttpOnly, SameSite=Lax, 기본 Secure다.
`local`에서만 Secure=false이며 세션 유휴 만료는 10분이다. URL 기반 세션 추적은 사용하지 않는다.
authorize와 callback의 호스트를 같게 사용해야 한다. localhost와 127.0.0.1은 서로 다른 쿠키 호스트다.
state가 5분 안에 만료되므로 로그인 화면에서 오래 머물렀다면 인가 시작부터 다시 진행한다.
배포 전 NAVER 전용 저장소에서 발급했던 진행 중 state는 새 저장소에서 거절되므로 다시 시작해야 한다.

**SSAFY 확인 범위:** 사용자가 정상 로그인 왕복에서 state 반환·일치를 관찰했다는 근거로 사용한다.
이번 구현 중 실제 공급자 요청·사용자 로그인은 실행하지 않았다. 공식 전체 지원 범위와
거절·SSO 세션 재사용·다른 브라우저 등 모든 경로의 반환은 확인되지 않았다.
어떤 경로에서도 state가 반환되지 않으면 인증을 확정하지 않는다. PKCE 지원은 가정하지 않는다.
SSAFY 운영 전에는 추가 왕복 검증과 공급자 공식 확인이 필요하다.

## 공급자 HTTP 연동

`OAuthProvider`의 고정 HTTPS endpoint만 사용한다. 사용자 입력으로 endpoint를 바꿀 수 없다.
별도 Security 필터 체인이나 OAuth2 Client 의존성을 추가하지 않고 기존 AUTH-01 서비스 경계를 확장했다.
`RestClient`의 연결 제한은 3초, 읽기 제한은 5초이며 HTTP redirect는 따라가지 않는다.
애플리케이션에서 토큰 교환을 재시도하지 않는다. 응답은 최대 64 KiB의 JSON 객체만 허용한다.

| provider | POST 토큰 endpoint | GET 프로필 endpoint | 식별 필드 |
| --- | --- | --- | --- |
| SSAFY | `https://project.ssafy.com/ssafy/oauth2/token` | `https://project.ssafy.com/ssafy/resources/userInfo` | 루트 `userId` |
| NAVER | `https://nid.naver.com/oauth2.0/token` | `https://openapi.naver.com/v1/nid/me` | `response.id`, `resultcode=00` |

토큰 요청은 form-urlencoded body로 grant_type=authorization_code, client_id, client_secret,
redirect_uri, code를 전달한다. NAVER에는 검증한 state도 전달한다.
프로필 요청의 Authorization 헤더는 Bearer다. NAVER id는 문자열, SSAFY userId는 문자열 또는 정수만 허용한다.
식별자는 비어 있거나 제어 문자를 포함하거나 255자를 초과하면 거절한다.
프로필의 닉네임·이메일·성별로 계정을 찾거나 병합하지 않는다.
외부 access/refresh token은 저장하거나 응답하지 않으며 사용자 식별 이후 사용하지 않는다.
HTTP/JSON 예외의 원문·원인 예외는 로그나 API 응답으로 전달하지 않는다.

NAVER POST 지원과 state 필수값은 [공식 API 명세](https://developers.naver.com/docs/login/api/api.md),
프로필 계약은 [공식 프로필 API](https://developers.naver.com/docs/login/profile/profile.md)를 따른다.
SSAFY 계약은 이번 작업에 제공된 규격을 따른다. 실제 SSAFY 토큰·프로필 응답 연동은 별도 검증 대상이다.
NAVER 검수 대기 상태에서 외부 로그인 성공을 검증했다고 해석하면 안 된다.

## 사용자 상태와 트랜잭션

`AuthUserStateService`는 `db` 프로필에서만 활성화된다. DB 없는 기본/local 실행은 유지한다.
DB 기능이 없으면 callback은 503으로 거절하며 신규 회원이라고 추정하지 않는다.
이 경우 서버에는 `reason=USER_STATE_SERVICE_MISSING; required_profile=db`의 고정 WARN 메시지를 남긴다.
요청 URL·인가 code·state·세션 ID·토큰·사용자 식별자·설정 값이나 예외 원문은 이 로그에 넣지 않는다.
IntelliJ에서 AUTH callback을 검증할 때는 활성 프로필을 `local,db`로 지정하고 DB 환경변수를 주입한다.
이전에 소비한 state를 다시 쓰지 말고 authorize부터 다시 시작한다.

`UserRepository.findForLogin`은 `(login_provider, provider_user_id)`로 탈퇴 행까지 조회하고
`PESSIMISTIC_WRITE` 행 잠금을 사용한다. 외부 HTTP 호출은 이 트랜잭션 전에 끝낸다.
잠금을 획득한 현재 시점에 deleted_at과 복구 기한을 판정한다.

| 상태 | 처리 | 서버에 연계하는 정보 |
| --- | --- | --- |
| 행 없음 | users INSERT 없이 온보딩 대상 | provider, NEW_MEMBER, 검증된 providerUserId |
| deleted_at=NULL | 기존 사용자 | provider, EXISTING_MEMBER, 기존 userId |
| 탈퇴 후 정확히 7일 이내 | deleted_at=NULL로 복구, ID·다른 데이터 보존 | provider, RESTORED_MEMBER, 기존 userId |
| 7일 초과 | 행과 관련 데이터 보존, HTTP 409 | AUTH_REJOIN_PENDING, 교환 코드 없음 |

7일은 UTC Instant 기준 168시간이며 정확히 7일인 시점도 포함한다.
동시 복구 요청은 잠금 해제 후 최신 행을 읽으므로 하나는 RESTORED_MEMBER, 나머지는 EXISTING_MEMBER가 된다.
updated_at은 기존 JPA 생명주기 콜백으로 갱신한다. V1 스키마·UNIQUE·닉네임 정책은 변경하지 않는다.
미래 deleted_at이나 DB/트랜잭션 오류는 안전한 503으로 처리한다.
7일 초과 행을 남긴 채 신규 행을 추가하면 기존 복합 UNIQUE와 충돌하므로 임의 재가입·삭제를 하지 않는다.

복구 DB 커밋과 메모리 교환 코드 발급/HTTP 전달은 하나의 분산 트랜잭션이 아니다.
복구 뒤 저장소 용량 초과나 응답 전달 실패가 발생하면 복구는 유지될 수 있다.
사용자가 인가부터 재시도하면 동일 ID의 활성 사용자로 처리한다.

## 일회용 교환 코드와 후속 API 계약

`OAuthExchangeStore.issue(request, outcome)`는 256비트 난수 코드를 발급한다.
서버 메모리에는 코드 해시, 원래 세션 ID의 해시, LoginOutcome, 만료 시각만 저장한다.
원문 코드·OAuth token·인가 code를 저장하지 않는다. 신규 providerUserId는 후속 온보딩을 위해서만 보관한다.

- 유효기간은 발급 후 60초이며 정확히 60초부터 거절한다.
- `consume(request, exchangeCode)`는 원래 세션에서만 `Optional<LoginOutcome>`를 한 번 반환한다.
- 누락·위조·만료·재사용·다른 세션은 empty다. 다른 세션의 오입력은 원래 코드를 소진하지 않는다.
- 발급·소비·정리를 동기화해 동시 요청에서 중복 소비를 막는다.
- 유효 항목은 최대 10,000개다. 용량을 넘으면 503으로 실패하며 기존 유효 코드를 임의 제거하지 않는다.
- 발급/소비 시 만료 항목을 정리하고 30초 주기로도 정리한다. 종료 시 지운다.
- 단일 인스턴스 메모리다. 재시작·장애·원래 세션 상실 시 인가부터 다시 진행해야 한다.

**AUTH-02 자체에는 교환 REST API가 없다.** 현재 구현된 교환 API는 [별도 문서](auth-exchange.md)를 따른다.
다음 원칙을 교환 및 후속 기능에서 유지한다.

1. 원래 세션 쿠키가 전송되는 `/api/v1/auth` 경계에서 코드를 body로 받고 내부 consume을 호출한다.
2. 회원의 현재 탈퇴 상태·사용 가능 여부를 다시 검증한다. NEW_MEMBER는 온보딩 완료 전 접근 권한을 주지 않는다.
3. 신규 온보딩 시 소셜키 중복을 DB UNIQUE로 재검증한다. 이 snapshot을 영구 권한으로 취급하지 않는다.
4. 실제 로그인 확정 시 세션 고정 방어·JWT/Refresh 설계를 적용한다. 여러 탭의 진행 중 시도 처리도 정한다.
5. 프론트/API 출처가 다르면 credentials·CORS·SameSite·CSRF 계약을 먼저 확정한다.
   프론트 JS가 HttpOnly 쿠키를 읽어 전달하는 방식은 사용하지 않는다.
6. 여러 인스턴스로 늘릴 때 state 세션과 교환 코드 모두 공유 저장소/원자 소비 방식을 설계한다.

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | AUTH_UNSUPPORTED_PROVIDER | ssafy/naver 외 provider |
| 400 | AUTH_INVALID_STATE | 세션·state·provider 검증 실패, 만료·재사용 포함 |
| 400 | AUTH_INVALID_CALLBACK | code 누락·중복 파라미터·성공/오류 동시 전달 |
| 401 | AUTH_PROVIDER_DENIED | 유효한 state와 함께 공급자 오류가 반환됨 |
| 409 | AUTH_REJOIN_PENDING | 탈퇴 후 7일 초과, 정책 결정 전 재가입 보류 |
| 500 | AUTH_CONFIGURATION_ERROR | ID/Secret/callback 등 신뢰 설정 오류 |
| 502 | AUTH_TOKEN_EXCHANGE_FAILED | 토큰 HTTP/통신/JSON/필수 응답 실패 |
| 502 | AUTH_PROFILE_FAILED | 프로필 HTTP/통신/JSON/식별자 실패 |
| 503 | AUTH_DATABASE_UNAVAILABLE | DB 프로필 없음·DB/트랜잭션 장애·잘못된 탈퇴 시각 |
| 503 | AUTH_EXCHANGE_CAPACITY_EXCEEDED | 교환 코드 저장 용량 초과 |

state 만료·위조의 세부 사유는 응답에서 구분하지 않는다. 공급자 error_description도 반사하지 않는다.
오류 뒤에는 이전 state/code를 재사용하지 말고 로그인 시작부터 다시 진행한다.

## 설정과 실행

| 환경변수 | 필요 시점 |
| --- | --- |
| SSAFY_CLIENT_ID / NAVER_CLIENT_ID | 각 provider authorize 및 callback |
| SSAFY_CLIENT_SECRET / NAVER_CLIENT_SECRET | 각 provider callback; 기본 비어 있음 |
| SSAFY_REDIRECT_URI / NAVER_REDIRECT_URI | 등록된 백엔드 callback; local 기본값은 localhost:8080 경로 |
| AUTH_FRONTEND_CALLBACK_URI | 미설정 200 JSON은 로컬 개발 검증용. 설정하면 302 fragment |
| DB_URL / DB_USERNAME / DB_PASSWORD | db 프로필, 기본값 없음 |

백엔드/프론트 callback 설정은 userinfo·query·fragment 없는 신뢰된 절대 URI여야 한다.
local 없이 실행하면 HTTPS만 허용한다. local에서는 HTTP localhost/127.0.0.1/[::1]도 허용한다.
백엔드 callback 경로는 provider별 `/api/v1/auth/{provider}/callback`으로 고정한다.
운영에서 local을 활성화하지 않는다. TLS 종료 프록시와 실제 HTTPS 쿠키 전달은 배포 환경에서 확인한다.
`.env`는 자동으로 로드되지 않는다. IDE·셸·배포 환경에서 이름별로 주입한다.
Secret은 보안 입력이나 비밀 관리 도구로 주입하고 파일·명령줄 인수·로그에 남기지 않는다.

```powershell
# backend/, Java 21. 위 환경변수는 IDE/셸/배포 환경에서 먼저 주입한다.
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'
```

callback을 시험하려면 db가 필요하다. DB 없는 WebSocket 개발은 기존 `--spring.profiles.active=local`로 유지한다.
DB 준비 방법은 [users DB 검증](users-schema.md#실제-mysql-검증)을 참고한다.

## 자동화 검증

```powershell
.\gradlew.bat clean build
.\gradlew.bat flowTest
# 별도 검증 DB의 TEST_DB_URL/TEST_DB_USERNAME/TEST_DB_PASSWORD 주입 후
.\gradlew.bat mysqlTest
```

- AuthCallbackControllerTests: Mock OAuth 공급자와 두 provider 성공, 상태별 코드 연계, state 공격,
  공급자 오류·잘못된/과대 JSON·설정/DB 오류·정보 비노출·프론트 redirect 계약을 확인한다.
- OAuthStateStoreTests / OAuthExchangeStoreTests: 난수 형식, 만료, 여러 탭/provider,
  다른 세션, 용량 정리, 재사용과 동시 소비를 확인한다.
- AuthUserStateServiceTests: 정확히 7일 경계의 ±1ms를 확인한다.
- AuthDatabaseProfileTests: 실제 local 단독 컨텍스트에서 DB Bean 부재·503과 고정 진단 로그의 비노출을 확인한다.
- AuthDatabaseDiagnosticsMySqlTests: 별도 MySQL에서 서비스 트랜잭션 프록시·빈 잠금 조회·트랜잭션 필수를 확인한다.
- AuthUserStateMySqlTests: 실제 MySQL에서 신규 행 미생성·활성·복구·보류·4개 동시 복구를 확인한다.
  전용 테스트 DB의 식별 가능한 fixture 행은 보존한다. 초기화·DELETE·DROP은 실행하지 않는다.
- 기존 AUTH-01 쿠키 HTTP 왕복, WebSocket 및 flowTest를 함께 실행한다.

Mock 테스트는 실제 외부 OAuth 성공을 의미하지 않는다. 실제 계정 로그인은 담당자가 수동으로 수행한다.

## 브라우저·Postman 수동 검증

1. 공급자에 등록한 callback과 서버 설정이 일치하는지 담당자가 확인하고 `local,db`로 실행한다.
   프론트 주소를 미지정하면 JSON 계약을 확인하기 쉽다. Secret·code·token·Cookie는 공유하거나 캡처하지 않는다.
2. 브라우저 최상위에서 `http://localhost:8080/api/v1/auth/ssafy/authorize`로 이동한다.
   개발자 도구에서 302와 세션 쿠키 속성, 인가 URL의 state 존재만 확인한다.
3. **담당자가 직접** 로그인한다. callback이 같은 호스트로 돌아오고 동일 세션/state가 전달되어야 한다.
   성공하면 200의 exchangeCode/expiresIn만 확인한다. 실제 코드를 콘솔·문서에 복사하지 않는다.
   프론트 주소를 설정했다면 등록한 주소로 302 후 fragment가 전달되어야 한다.
4. 전용 계정/DB에서 신규는 행 수가 늘지 않고, 활성은 ID가 유지되며, 복구 대상은 deleted_at이 NULL이 된다.
   7일 초과는 409 AUTH_REJOIN_PENDING이며 기존 행은 그대로다. 운영 데이터를 수동 변조하지 않는다.
5. 성공 callback 재요청은 400 AUTH_INVALID_STATE다. 쿠키 삭제·다른 브라우저·state 변조도 400이다.
   다시 로그인하려면 authorize부터 시작한다. 공급자 거절 시 유효 state가 있으면 401,
   state가 없으면 400으로 종료하며 토큰 교환하지 않는다.
6. Postman에서는 자동 redirect와 콘솔 기록을 끄고 동일 호스트 cookie jar를 사용한다.
   authorize의 302/쿠키를 확인하되 실제 사용자 로그인은 브라우저에서 담당자가 진행한다.
   Postman만으로 브라우저와 다른 세션을 사용한 callback은 400이 정상이다.
   유효 state에 존재하지 않는 테스트 code를 붙인 토큰 실패 시험은 별도 테스트 앱에서만 수동으로 한다.
   외부 성공·실패 계약은 자동화 Mock 테스트로 우선 확인하며 디버그 인증 API를 만들지 않는다.
7. 발급된 코드는 [인증 교환 수동 테스트](auth-exchange.md#브라우저postman-수동-테스트)에 따라
   동일 세션의 POST /api/v1/auth/exchange로 소비한다. 만료·재사용 시 로그인부터 다시 진행한다.
8. NAVER는 검수 승인·허용 테스트 계정 범위가 확인된 후 같은 절차를 진행한다.

## 운영 전 남은 결정

프론트 callback 주소, USER-05 온보딩 API, 분산 저장소, 요청량 제한, 운영 TLS·CORS 배포 검증,
SSAFY 전체 state 반환 범위, NAVER 승인 및 실연동, 7일 초과 데이터 처리 정책이 남아 있다.
프록시/APM/HTTP 디버그 로그에 callback query, Location, Cookie, 토큰 body/Authorization이 기록되지 않게 한다.
AUTH-02가 WebSocket Principal이나 서비스 접근 제어를 구현한 것으로 취급하면 안 된다.

## AUTH-02 시점의 실제 검증 기록

2026-10-21, `feat/S15P31B105-61-auth-callback`에서 Java 21로 검증했다.

| 실행 | 결과 |
| --- | --- |
| `.\gradlew.bat clean build` | 기본 프로필 299개 통과, 실패/건너뜀 0 |
| `.\gradlew.bat flowTest` | 실제 WebSocket 흐름 2개 통과 |
| `.\gradlew.bat mysqlTest` | 별도 MySQL 8.4.11 테스트 DB에서 32개 통과 |
| `git diff --check` | 통과 |

실제 DB에는 users와 flyway_schema_history만 존재하며 V1 성공 이력은 한 개다.
V1과 기존 DB 프로필·게임/WebSocket 코드는 변경하지 않았다. 커밋·Push·MR은 실행하지 않았다.
위 기록은 AUTH-02 당시 결과다. 이후 V2·교환 API를 포함한 검증 결과는 [인증 교환 문서](auth-exchange.md)를 따른다.
보고서는 `backend/build/reports/tests/{test,flowTest,mysqlTest}/index.html`에 있다.
외부 공급자의 실제 로그인은 이번에 수행하지 않았다.

다음 리소스는 개발 DB ontop_dev와 분리한 테스트 전용 리소스다. 초기 검증 후 보존했고,
MR 전 검증에서는 이미 실행 중인 컨테이너를 재사용한다. 컨테이너·볼륨을 삭제하거나 초기화하지 않는다.

- 컨테이너: `ontop-auth61-test-20261021-073629-ac72f0`
- 볼륨: `ontop-auth61-data-20261021-073629-ac72f0`
- DB: `ontop_users80_test_auth61_20261021_073629_ac72f0`
- MR 전 검증 시 바인딩: `127.0.0.1:49701` → 컨테이너 3306

정지 상태라면 `docker start ontop-auth61-test-20261021-073629-ac72f0`를 사용한다.
호스트 포트는 자동 할당이므로 기동 후 `docker port ontop-auth61-test-20261021-073629-ac72f0 3306/tcp`로 확인한다.
다음 정리 명령은 **실행하지 않았다**. 담당자가 보존 필요 여부를 확인한 뒤 해당 리소스만 정리한다.

```powershell
docker rm ontop-auth61-test-20261021-073629-ac72f0
docker volume rm ontop-auth61-data-20261021-073629-ac72f0
```
