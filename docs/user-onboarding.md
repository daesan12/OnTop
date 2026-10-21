# 신규 회원 온보딩 — S15P31B105-91 USER-05

## 사용자 흐름과 범위

시작 화면에는 `네이버로 시작하기`, `SSAFY로 시작하기`만 있다. 별도 회원가입 버튼/화면을 전제하지 않는다.
AUTH-01 인가 → AUTH-02 콜백 → 89번 교환 API로 진행한다.

- AUTHENTICATED: 기존/복구 회원이며 바로 로그인한다. USER-05를 호출하지 않는다.
- ONBOARDING_REQUIRED: 아직 users가 없는 계정이다. 닉네임과 캐릭터 성별을 정하고 USER-05를 호출한다.
- 탈퇴 7일 이내 복구와 7일 초과 재가입 보류는 기존 AUTH-02 정책을 따른다.

USER-05는 가입을 확정하고 JWT/Refresh를 발급한다. Wallet·USER-04 중복 확인 API·로그아웃·재발급·전역 REST/
WebSocket 인증은 구현하지 않는다. 중복 회원 오류는 DB 무결성 보호이며 별도 회원가입 흐름을 추가한 것이 아니다.

## HTTP 계약

`POST /api/v1/users/onboarding`

```http
Content-Type: application/json
Authorization: Bearer <89번이 발급한 ob_ 온보딩 토큰>
```

```json
{"nickname":"미지","characterGender":"FEMALE"}
```

두 문자열 필드만 허용한다. userId/provider/providerUserId/token 등 다른 필드는 거절한다.
일반 Access JWT·Refresh·임의 문자열은 온보딩 인증이 아니다.
온보딩 토큰은 독립적인 일회성 Bearer다. JSESSIONID 없이 호출할 수 있고 기존 세션도 조회·생성·회전하지 않는다.
256비트 난수, 발급 후 600초 만료, 서버 측 검증된 소셜 식별자 연결, 원자적 일회 소비를 유지한다.

HTTP 201 Created:

```json
{
  "userId": 1,
  "nickname": "미지",
  "characterGender": "FEMALE",
  "accessToken": "<Access JWT>",
  "tokenType": "Bearer",
  "expiresIn": 1800
}
```

Refresh 원문은 JSON에 포함하지 않고 기존 ONTOP_REFRESH HttpOnly 쿠키로만 발급한다.
응답은 Cache-Control: no-store, Referrer-Policy: no-referrer다. USER-05는 JSESSIONID를 발급하지 않는다.
회원 생성 후 추가 OAuth 로그인 없이 받은 Access JWT를 사용할 수 있다.
이번 Story가 서비스 전체의 REST/WebSocket 인증 연결까지 구현한 것은 아니다.

## 닉네임·성별

- 닉네임은 **2~8자**이고 `[가-힣A-Za-z0-9]{2,8}` 전체 일치만 허용한다.
- 공백·특수문자·이모지·초성·분해형 한글·악센트 문자는 거절한다. trim/대소문자 변환을 임의 수행하지 않는다.
- 서비스의 existsByNickname과 DB의 nickname UNIQUE를 함께 사용한다.
- nickname의 기존 utf8mb4_0900_as_ci collation으로 대소문자를 무시한다. 탈퇴 행도 중복 대상이다.
- 성별은 정확히 MALE/FEMALE 문자열만 허용한다. 숫자 enum·소문자·공백이 붙은 값은 거절한다.
- 성별 변경 API는 없고 User의 기존 updatable=false 매핑을 유지한다.

최소 2자는 이번 API 입력 정책이다. 기존 V1의 VARCHAR(8)·CHECK·UNIQUE와 Entity 길이 8 매핑은 유지한다.
기존 DB 행을 정리하거나 V1/V2를 변경하지 않는다.

## 토큰 소비와 트랜잭션

1. Origin/CORS와 JSON/닉네임/성별 형식을 검증한다.
2. Authorization 헤더 하나의 OnboardingTokenStore Bearer 토큰을 확인하고 원자적으로 claim(임시 선점)한다.
   저장소는 HttpServletRequest/HttpSession 인자를 받지 않고 세션 ID를 보관하지 않는다.
3. 선점한 OAuthIdentity만 사용한다. providerUserId를 클라이언트에서 받지 않는다.
4. UserOnboardingPersistenceService.create의 독립된 REQUIRES_NEW 트랜잭션에서 소셜키와 닉네임을 조회한다.
   탈퇴 행을 제외하지 않는다. TransactionSynchronization.afterCompletion으로 실제 커밋/롤백 완료를 기록한다.
5. User를 saveAndFlush하고 AuthExchangePersistenceService.issueForNewUser를 호출한다.
6. 기존 Access 서명·Refresh 난수/해시 저장 로직을 재사용한다. issueForNewUser는 MANDATORY이므로 같은
   트랜잭션에 참여한다. 별도 REQUIRES_NEW로 자격 정보만 커밋하지 않는다.
7. 커밋 완료가 확인되고 인증 응답 준비가 성공한 뒤 complete로 토큰을 최종 소비한다.
   201 및 Refresh 쿠키를 반환한다. 세션 작업은 수행하지 않는다.

JWT 발급·Refresh 저장·커밋 실패 시 성공 응답/새 Refresh 쿠키를 보내지 않는다.
JWT/Refresh 저장 실패가 회원 INSERT 뒤에 발생해도 users와 refresh_tokens가 함께 롤백된다.

### 실패 후 재시도

| 실패 시점 | 온보딩 토큰 | 재시도 |
| --- | --- | --- |
| Origin/JSON/닉네임/성별 형식 오류 | 선점하지 않음 | 남은 유효기간 안에 같은 Bearer로 수정 요청 가능 |
| 잘못된 헤더/위조 토큰 | 원래 유효 토큰은 선점하지 않음 | 올바른 Bearer 필요, 세션은 무관 |
| 정확히 600초 경과/이미 완료·무효화됨 | 사용 불가, 401 | 소셜 로그인부터 다시 시작 |
| 같은 토큰의 다른 요청이 처리 중 | 추가 선점 거절, 401 | 처리 중인 요청의 결과를 기다린다 |
| 닉네임 중복 + 롤백 완료 확인 | 선점 해제, 409 USER_NICKNAME_ALREADY_EXISTS | 최초 만료 전 같은 Bearer + 다른 닉네임으로 재시도 |
| 이미 가입된 소셜키 | 무효화, 409 USER_ALREADY_REGISTERED | 새 OAuth 로그인으로 기존 회원 흐름 이용 |
| 설정/DB/발급 오류·중복 원인 조회 실패 | 무효화 | 소셜 로그인부터 다시 시작 |
| 커밋/롤백 결과 불명 | 무효화, 503 | 토큰을 재활성화하지 않고 새 로그인으로 상태 확인 |

닉네임 충돌은 사전 조회와 실제 DB UNIQUE 경합 모두 위 정책을 적용한다. 닉네임 409는 반드시 롤백 완료가
확인된 경우에만 반환한다. 롤백을 확인할 수 없으면 503이며 토큰을 무효화한다. 서버의 자동 재시도는 없다.
선점 해제는 기존 항목의 원래 만료 시각을 그대로 유지하며 새 토큰을 발급하거나 소비한 토큰을 복원하지 않는다.
만료 직전에 선점한 요청은 처리 도중 600초가 지나도 커밋을 마칠 수 있지만, 실패 후 만료된 토큰으로 재시도할 수 없다.
USER-04가 구현되면 가입 확정 전 중복 확인 UX에 사용할 수 있으나 DB 최종 UNIQUE를 대신하지 않는다.

### 토큰 상태 전이

`사용 가능 → 선점 중 → 성공 소비`가 정상 흐름이다. `선점 중 → 사용 가능`은 롤백이 확인된 닉네임 중복에만
허용한다. 나머지 실패는 `선점 중 → 무효화`다. 모든 상태는 최초 만료 시각을 넘겨 재활성화되지 않는다.
선점 객체의 소유권을 비교하므로 이전 요청의 지연된 해제/무효화가 다음 요청의 선점을 변경할 수 없다.
만료된 선점도 주기적으로 제거하며 완료/무효화 항목을 메모리에 계속 보관하지 않는다.

메모리 선점/확정과 DB 커밋은 하나의 분산 트랜잭션이 아니다. 재시작/DB 장애에 토큰을 복구하지 않는다.
커밋 후 네트워크/응답 실패가 발생하면 회원과 전달되지 않은 Refresh 해시가 남을 수 있다.
이때 가입을 삭제하거나 토큰을 복원하지 않는다. 새 OAuth 로그인의 기존 회원 AUTHENTICATED 흐름을 이용한다.
커밋 후 Refresh 쿠키/응답 준비에 실패한 경우도 토큰을 무효화한다. 이미 커밋한 가입을 되돌리거나 재시도하지 않는다.
자동 증가 ID의 공백은 롤백 시 생길 수 있으며 오류가 아니다.

## 동시 요청과 중복

- 같은 토큰은 synchronized claim으로 한 요청만 DB 단계에 진입한다. 처리 중 다른 요청은 401이다.
- 같은 소셜 계정의 서로 다른 토큰이나 같은 닉네임의 가입은 사전 조회 후 경합할 수 있다.
- 없는 행의 비관적 잠금에 의존하지 않고 기존 두 DB UNIQUE가 최종 차단한다.
- DataIntegrityViolationException 발생 시 afterCompletion의 STATUS_ROLLED_BACK을 확인하고 새 조회로
  소셜키/닉네임 충돌을 분류한다. 소셜키 중복을 우선한다. 닉네임 중복만 선점을 해제한다.
  기존 회원을 갱신·복구·덮어쓰지 않는다. 롤백/충돌을 확인하지 못하거나 DB 조회도 실패하면 503이다.
- 데드락/잠금 시간 초과 등 저장소 실패에는 성공을 가장하거나 자동 재시도하지 않는다.
- 서로 다른 공급자의 같은 providerUserId는 별도 소셜키이므로 서로 다른 회원으로 가입할 수 있다.

## 세션 쿠키·CORS·로그

이번 보완 전 JSESSIONID Path는 /api/v1이었고 **원래의 /api/v1/auth로 되돌렸다**.
HttpOnly·host-only·Secure·SameSite=Lax는 유지한다. USER-05는 이 쿠키를 요구하지 않는다.
Refresh 쿠키는 기존 Path=/api/v1/auth를 유지하며 온보딩 응답에서 발급할 수 있다.
OAuth 교환 코드의 동일 세션 검증·일회 소비·세션 ID 회전 정책은 유지한다. 이미 발급된 온보딩 Bearer에는 영향이 없다.

USER-05의 POST/OPTIONS만 기존 AUTH_ALLOWED_ORIGINS 정책을 재사용한다.
허용 Origin에만 credentials=true와 정확한 ACAO를 응답하며, preflight는 POST 및 Authorization/Content-Type만
허용한다. AUTH-89와 다른 REST/WebSocket의 CORS 계약을 넓히지 않는다.
다른 Origin의 프론트에서는 Refresh 쿠키 저장을 위해 fetch의 credentials: include와 정확한 허용 Origin이 필요하다.
다른 사이트라면 HTTPS·Refresh SameSite=None/Secure·제3자 쿠키 차단을 함께 검토한다.
OAuth 교환 단계는 여전히 세션이 필요하며 그 단계의 세션 쿠키 조건은 별도로 유지한다.
기존 [교환 API의 배포 조건](auth-exchange.md#refresh-쿠키origincsrf)을 따른다.

세션 결합을 제거했으므로 온보딩 Bearer를 탈취한 사람은 남은 시간 안에 다른 클라이언트에서도 사용할 수 있다.
토큰을 브라우저 메모리에서 짧게 사용하고 URL·로그·공유 저장소에 남기지 않는다. 운영 HTTPS는 필수다.

MySQL 중복키 메시지에는 providerUserId가 포함될 수 있어 Hibernate SqlExceptionHelper 로그를 OFF로 설정했다.
중복 원인을 SQL 예외 메시지로 추출하거나 원문 예외를 응답·로그에 기록하지 않는다.
토큰/코드/세션/소셜 식별자·Authorization/Cookie·응답 본문을 HTTP 디버그/APM 로그에 수집하지 않아야 한다.
요청·응답과 자격 정보 DTO의 toString은 원문을 가린다.

## 오류 계약

모든 오류는 기존 code/message JSON이며 새로운 인증 쿠키를 발급하지 않는다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | USER_INVALID_ONBOARDING_REQUEST | 누락/잘못된 JSON·자료형·추가 필드·Content-Type |
| 400 | USER_INVALID_NICKNAME | 닉네임 형식 |
| 400 | USER_INVALID_CHARACTER_GENDER | 성별 값 |
| 401 | AUTH_INVALID_ONBOARDING_TOKEN | 누락·위조·만료·처리 중·소비됨·무효화됨·일반 JWT |
| 403 | AUTH_ORIGIN_NOT_ALLOWED | Origin/preflight/Fetch Metadata 거절 |
| 409 | USER_NICKNAME_ALREADY_EXISTS | 탈퇴 행 포함 닉네임 중복, 최초 만료 전 같은 토큰 재시도 가능 |
| 409 | USER_ALREADY_REGISTERED | 이미 가입된 소셜키, 새 OAuth 로그인 필요 |
| 500 | AUTH_TOKEN_CONFIGURATION_ERROR | JWT/쿠키/Origin 설정 오류 |
| 503 | USER_ONBOARDING_UNAVAILABLE | db 비활성·DB/커밋 장애·분류할 수 없는 무결성 실패 |

## Postman 수동 검증

1. local,db와 기존 DB/OAuth/JWT 환경변수를 설정한다. 새 환경변수는 없다.
   AUTH_JWT_SECRET_BASE64가 필수다. 89번의 신규 온보딩 난수 발급 성공만으로 JWT 키가 검증되지는 않는다.
2. 이전 구현의 Path=/api/v1 쿠키가 남았다면 해당 호스트 JSESSIONID를 정리하고 새 로그인을 시작한다.
   OAuth용 새 쿠키의 Path=/api/v1/auth를 확인한다. DB 데이터를 삭제하는 작업이 아니다.
3. **아직 ontop_dev에 없는 소셜 계정**으로 담당자가 직접 로그인한다. 이미 준비한 기존 회원 계정을 삭제하거나
   식별자를 바꿔 신규로 가장하지 않는다. NAVER는 실제 앱의 허용 테스트 계정/검수 상태를 확인한다.
4. 같은 세션의 89번 교환 API에서 ONBOARDING_REQUIRED와 onboardingToken을 받는다.
5. 최초 발급 후 10분 안에 이 문서의 POST를 호출한다. Authorization: Bearer에는 onboardingToken만 넣는다.
   기존에 사용 중인 닉네임으로 409 USER_NICKNAME_ALREADY_EXISTS를 확인한 뒤, 같은 토큰과 새 닉네임으로
   재시도하면 201이어야 한다. 반복 409로 발급 시각/만료를 연장할 수 없다. 새 회원 생성은 로컬에서 승인 후 진행한다.
   온보딩 요청에 JSESSIONID를 보내지 않아도 201이어야 한다. Refresh 쿠키를 사용할 API 호스트는 일관되게 사용한다.
6. 201의 사용자 정보·Access JWT, Refresh Set-Cookie를 확인한다. JWT 서명·클레임 확인은
   [로컬 검증 방법](auth-exchange.md#브라우저postman-수동-테스트)을 사용하고 외부 JWT 사이트에 붙여넣지 않는다.
7. DB에서 승인한 새 사용자 1행과 해당 ID를 참조하는 Refresh 1행 증가를 로컬에서 확인한다.
   Refresh 쿠키 원문 전체 SHA-256이 token_hash와 같고 수명 7일·revoked_at=NULL인지 확인한다.
   보고서에는 값이 아닌 일치 여부만 남긴다. 기존 사용자/Refresh 행은 보존한다.
8. 같은 온보딩 토큰 재사용은 401이며 추가 행이 없어야 한다. 새 로그인은 AUTHENTICATED여야 한다.
9. 입력 형식 오류 400·닉네임 409 후에는 원래 만료 전 같은 토큰으로 수정할 수 있다.
   소셜키 409/저장 실패/만료 후에는 새 로그인으로 진행한다. 같은 토큰을 병렬로 자동 재전송하지 않는다.

실제 토큰·코드·세션·식별자는 콘솔·채팅·공유 Postman 환경·스크린샷에 남기지 않는다.
테스트 전용 공개 가입/인증 우회 API는 없다.

## 자동화 검증과 후속 작업

OnboardingTokenStoreTests는 선점 소유권·반복 해제 후 고정 만료·동시 선점·최종 소비/무효화를 검증한다.
UserOnboardingControllerTests는 입력·인증·일회 소비·닉네임 재시도·고정 만료·동시 요청·오류·커밋/롤백 실패·Origin을 검증한다.
UserOnboardingMySqlTests는 회원/Refresh/JWT·FK·대소문자·탈퇴 닉네임·동시 가입·롤백과 실제 HTTP 흐름을 검증한다.
사전 조회 직후 별도 연결이 닉네임을 먼저 커밋하게 하여 실제 MySQL UNIQUE 충돌 후 같은 토큰 재시도를 검증한다.
새 쿠키 jar에서 세션 없이 201을 받고, 같은 소셜 계정으로 다시 OAuth 교환하면 AUTHENTICATED인지 확인한다.
외부 공급자는 테스트 Bean에서만 Mock하며 실제 공급자 성공을 가장하지 않는다.

```powershell
# TEST_DB_*는 별도 loopback 테스트 DB로만 주입한다. ontop_dev 사용 금지.
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

기존 ontop_users80_test_ 접두어 테스트 DB를 재사용한다. 테스트에서 추가한 onboard91- 사용자와 Refresh fixture는
해당 DB에만 보존한다. V1/V2·개발 DB·기존 Docker 컨테이너/볼륨은 초기화·삭제하지 않는다.
USER-04, Wallet, 전역 서비스 인증, 분산 토큰 저장, 요청량 제한, 만료 행 보관/삭제는 후속 범위다.
가입 후 받은 Refresh 쿠키의 재발급/회전은 별도 [AUTH-04](auth-refresh.md) 계약을 따른다.
현재 로그인 계열 로그아웃은 [AUTH-03](auth-logout.md)을 따른다. 온보딩 정책은 변경하지 않는다.

### 실제 검증 기록

2026-10-21, `feat/S15P31B105-91-user-onboarding`, Java 21에서 닉네임 409 재시도 보완을 검증했다.

| 항목 | 결과 |
| --- | --- |
| clean build / 기본 test | 405개 통과, 실패·오류·건너뜀 0 |
| flowTest | 실제 WebSocket 흐름 2개 통과 |
| mysqlTest | MySQL 8.4.11에서 57개 통과, 온보딩 15개 포함 |
| OnboardingTokenStoreTests | 7개 통과, 고정 만료·선점 소유권·동시 선점·소비/무효화 포함 |
| UserOnboardingControllerTests | 55개 통과, 세션 없는 재시도·고정 만료·커밋/롤백 결과 불명 차단 포함 |
| JPA / Flyway | validate 성공, 현재 V2, 재적용 0개 |
| git diff --check | 통과 |

기존 `ontop-auth61-test-20261021-073629-ac72f0` 컨테이너와
`ontop_users80_test_auth61_20261021_073629_ac72f0` DB(127.0.0.1:49701)를 재사용했다.
신규 컨테이너/볼륨은 생성·삭제하지 않았다. 실제 공급자 로그인은 실행하지 않았다.
개발 DB ontop_dev는 작업 전후 users 2행·Refresh 3행, 각 데이터 체크섬과 V1/V2 이력이 동일했다.
해당 DB에 테스트를 실행하거나 데이터를 추가·수정·삭제하지 않았다.
결과 보고서는 `backend/build/reports/tests/{test,flowTest,mysqlTest}/index.html`에 있다.

### 실제 브라우저 쿠키 검증

2026-10-21 Codex 내장 브라우저에서 별도의 loopback 검증 서버와 위 격리 테스트 DB를 사용했다.
JSESSIONID 없는 Bearer 온보딩 POST가 201을 반환하고, 브라우저가 저장한 ONTOP_REFRESH를
/api/v1/auth 경로로 다시 전송하여 DB 해시와 일치함을 확인했다. document.cookie에는 원문이 보이지 않았다.
로컬 동일 Origin/HTTP/SameSite=Lax/Secure=false 검증이며 운영 HTTPS·다른 사이트 조합까지 검증한 것은 아니다.
운영 코드에 검증 경로나 인증 우회 API를 추가하지 않았다. 임시 검증 도구/스크린샷은 Git 제외
`backend/.gradle/onboard91-browser/`에 있으며 검증 서버는 종료했다.
자동 생성한 onboard91-browser- 계정 1개와 Refresh 1행은 격리 테스트 DB에만 남긴다.
