# 현재 로그인 세션 로그아웃 — S15P31B105-62 AUTH-03

## HTTP 계약

`POST /api/v1/auth/logout`

- 현재 로그인 계열은 ONTOP_REFRESH 쿠키로만 식별한다.
- Access JWT/Authorization Bearer/JSESSIONID는 필요 없다. 본문은 비운다.
- AUTH_ALLOWED_ORIGINS에 정확히 등록된 Origin 헤더가 필수다. Origin 누락/불일치/null/중복은 403이다.
- 성공은 **204 No Content**이며 응답 본문이 없다.
- 성공 응답은 ONTOP_REFRESH=; Max-Age=0 삭제 쿠키와 Cache-Control: no-store, Referrer-Policy: no-referrer를 보낸다.
- 반복 요청·쿠키 누락·잘못된 형식·알 수 없는 해시·만료·이미 폐기된 토큰도 정상 설정/DB 처리 아래 204다.
- 중복 ONTOP_REFRESH 쿠키는 어느 계열인지 임의 선택하지 않고 400으로 거절한다. 본문이 있어도 400이다.

오류는 기존 `{code,message}` 형식이다. 오류 응답에는 삭제 쿠키를 보내지 않는다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | AUTH_INVALID_LOGOUT_REQUEST | 본문 있음 또는 중복 Refresh 쿠키 |
| 403 | AUTH_ORIGIN_NOT_ALLOWED | Origin/Fetch Metadata/preflight 거절 |
| 500 | AUTH_TOKEN_CONFIGURATION_ERROR | 쿠키/Origin 설정 오류 |
| 503 | AUTH_LOGOUT_STORAGE_UNAVAILABLE | db 비활성·DB 조회/폐기/커밋 실패·계열 정합성 확인 실패 |

## 현재 계열 식별과 멱등성

1. Origin을 필터와 서비스 양쪽에서 검증한다. 인코딩/경로 파라미터로 필터의 URI 비교를 건너뛰어도 거절한다.
2. 요청 쿠키 중 ONTOP_REFRESH만 읽고, 기존 RefreshCookieService에서 삭제 헤더를 먼저 준비한다.
3. 쿠키가 없거나 `rt_` + 43자리 Base64URL 형식이 아니면 DB 조회 없이 204로 삭제한다.
4. 정상 형식이면 기존 OpaqueTokens.digest로 SHA-256 해시를 계산한다. 원문은 DB/로그에 저장하지 않는다.
5. 기존 findReferenceByTokenHash projection으로 회원 ID를 읽고 회원 행 → Refresh 행 순서로 잠근다.
6. 해시가 DB에 없으면 멱등적으로 끝낸다. 있으면 회원·Refresh 소유자 일치를 확인하고,
   기존 revokeSession(userId, sessionId, now)로 그 계열의 미폐기 행 전체를 폐기한다.

회원 ID/session_id는 클라이언트에서 받지 않는다. 같은 회원의 다른 로그인 UUID 계열과 다른 회원은 폐기하지 않는다.
소프트 탈퇴한 회원도 해당 계열을 로그아웃할 수 있다. 이미 폐기된 행의 시각과 rotated_at은 덮어쓰지 않는다.

**DB에 존재하는 해시는 만료/폐기/회전 여부와 무관하게 현재 요청이 지정한 계열을 찾는 데 사용한다.**
이것은 인증 발급 권한이 아니다. Rotation이 먼저 커밋한 직후에도 이전 쿠키로 후속 Refresh를 폐기하기 위한 정책이다.
회전된 이전 쿠키를 5초 이후에 보내도 AUTH-04의 재사용 탐지를 호출하지 않고 같은 계열만 204로 로그아웃한다.
유출된 이전 토큰을 보유한 사람도 같은 계열의 로그아웃을 유발할 수 있으나, 다른 계열 제재나 인증 발급은 불가능하다.

정상 형식 쿠키를 받은 상태에서 DB를 확인할 수 없으면 503이다. 조회되지 않은 토큰을 위조라고 가정하지 않는다.
반면 쿠키 자체가 없거나 형식상 유효할 수 없는 요청은 DB 없는 기본 프로필에서도 204로 쿠키만 정리할 수 있다.
쿠키 누락 204는 특정 서버 세션의 폐기를 확인했다는 의미가 아니다. 브라우저가 실제 쿠키를 전송했는지 확인해야 한다.

## 트랜잭션과 AUTH-04 동시성

AuthLogoutPersistenceService.logout은 REQUIRES_NEW 트랜잭션이며 반환 시점에 커밋이 완료된다.
AuthLogoutService는 해당 호출이 성공한 뒤에만 준비된 삭제 헤더를 컨트롤러에 전달한다.
설정 오류는 폐기 전에 실패한다. DB 예외 원문·SQL·쿠키/토큰/소셜 식별자를 응답이나 로그에 반사하지 않는다.

AUTH-04와 동일하게 회원을 먼저 잠그므로 두 요청의 순서는 아래 둘 중 하나다.

| 순서 | 결과 |
| --- | --- |
| 로그아웃 → Rotation | 기존 토큰 폐기 커밋 후 Rotation은 401, 새 토큰 생성 없음 |
| Rotation → 로그아웃 | Rotation이 만든 후속 토큰까지 같은 session_id로 폐기, 활성 Refresh 없음 |

같은 계열의 여러 회전 이력도 모두 폐기 상태가 된다. 다른 로그인 계열은 유지한다.
AUTH-04의 API·5초 유예·재사용 탐지·7일 슬라이딩 만료 정책을 변경하지 않는다.
기존 회원 생성/온보딩은 같은 쿠키 발급 함수를 그대로 사용한다.

폐기 UPDATE 실패는 롤백되며 503과 고정 오류만 반환한다. 커밋 예외도 204로 바꾸지 않는다.
연결 단절 등으로 커밋 결과가 불명일 때는 폐기가 성공/롤백되었다고 단정하지 않고 503을 반환한다.
같은 로그아웃 요청은 멱등적으로 다시 시도할 수 있다. 실패 응답에서 쿠키를 삭제해 서버 폐기 성공을 가장하지 않는다.

DB 커밋과 브라우저의 쿠키 삭제는 하나의 분산 트랜잭션이 아니다. 커밋 후 응답을 잃으면 서버는 폐기됐지만
브라우저에 오래된 쿠키가 남을 수 있다. 재시도 시 204로 다시 정리하며 그 쿠키로 Refresh 발급은 실패한다.
활성 계열의 회전 이력을 삭제하는 정리 배치는 현재 없다. 향후 보관 정책은 이전 해시로 계열을 찾는 책임을 함께 고려한다.

## Cookie 삭제·CORS·Origin

RefreshCookieService의 발급/삭제가 동일 builder를 사용한다.

| 속성 | 발급 / 삭제 |
| --- | --- |
| Name | ONTOP_REFRESH |
| Path | 기존 /api/v1/auth 유지 |
| Domain | 둘 다 설정하지 않음(host-only) |
| HttpOnly | 둘 다 true |
| Secure / SameSite | 기존 AUTH_REFRESH_COOKIE_* 설정을 동일하게 사용 |
| Max-Age | 발급 604800 / 삭제 0 |

운영에서 Secure=false는 설정 오류다. SameSite=None은 Secure=true가 필수다.
쿠키 Path 마이그레이션·AUTH-04 경로 변경·JSESSIONID 무효화·다른 쿠키 삭제는 수행하지 않는다.

AuthLogoutOriginFilter는 POST/OPTIONS /api/v1/auth/logout에만 적용하며 기존 AuthExchangeOriginPolicy를 재사용한다.
허용된 Origin에만 정확한 ACAO와 credentials=true를 반환한다. preflight는 POST 및 Content-Type만 허용한다.
Origin 없는 요청은 Fetch Metadata가 same-origin이어도 허용하지 않는다. POST 서비스 경계에서도 필수 검증한다.
Origin/본문/중복 쿠키 거절은 폐기 전에 끝난다. 전역 CORS와 OAuth/WebSocket 계약을 변경하지 않는다.

프론트 fetch에는 credentials: include가 필요하다. 다른 사이트라면 실제 HTTPS·SameSite=None/Secure와
브라우저 제3자 쿠키 제한을 함께 확인한다. 프록시에서 Origin을 임의로 추가/덮어쓰지 않는다.
쿠키·JWT·Authorization·소셜 식별자·비밀번호를 HTTP/APM/디버그 로그에 수집하지 않는다.

## Access JWT와 프론트 처리

S15P31B105-113부터 Refresh 로그인 계열 폐기로 **같은 sid의 Access도 보호 REST/접속권 발급에서401**이다.
미소비 접속권도 거절하며 커밋 후 그 로그인 계열의 WebSocket을4401로 종료한다.
서명 자체는 만료 전 유효할 수 있으므로 JWT 서명 확인만으로 서비스 접근을 허용하면 안 된다.
블랙리스트나 소셜 공급자 토큰 폐기는 도입하지 않았다. [세션 무효화와 연결 종료](session-invalidation.md)를 따른다.

프론트는 로그아웃 204 이후 메모리의 Access JWT·회원 상태를 지운다.
진행 중인 Refresh 요청을 중단/정리하고, 로그아웃 이전 요청의 늦은 JWT 응답을 상태에 다시 저장하지 않아야 한다.
예를 들어 인증 상태 세대 번호를 두어 오래된 응답을 무시할 수 있다. 계정 전환도 로그아웃 완료를 기다린다.

Rotation 응답이 먼저 커밋됐지만 HTTP 전달은 로그아웃보다 늦을 수 있다. 이때 늦은 Set-Cookie로 브라우저에
이미 서버 폐기된 Refresh가 다시 남을 수 있으나 재발급은 401이다. 서버 활성 계열이 되살아나는 것은 아니다.
다른 로그인 기기와 커밋 전에 이미 인증된 진행 중 REST 요청을 소급 취소하지는 않는다.

## 환경변수와 로컬 실행

새 환경변수/Secret은 없다. 기존 DB_URL/DB_USERNAME/DB_PASSWORD, AUTH_ALLOWED_ORIGINS,
AUTH_REFRESH_COOKIE_SECURE/SAME_SITE/PATH를 재사용한다. 로그아웃 자체는 JWT 서명 키를 사용하지 않는다.
실제 OAuth/교환/온보딩/재발급을 함께 시험한다면 해당 기존 JWT/OAuth 설정은 별도로 필요하다.
.env는 자동 로드하지 않는다. IntelliJ의 비공유 실행 구성 등에 기존 설정을 주입한다.

```powershell
# backend/, Java 21. 환경변수는 값 출력 없이 사전 주입
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'
```

## Postman 수동 검증

1. 담당자가 직접 기존 로그인/교환 또는 온보딩을 완료해 API 호스트 cookie jar에 ONTOP_REFRESH를 받는다.
   별도 cookie jar/클라이언트의 다른 로그인 세션도 준비하면 세션 범위를 비교할 수 있다.
2. POST http://localhost:8080/api/v1/auth/logout, Body=None, Authorization=None을 설정한다.
   Origin에는 http://localhost:8080 등 실제 AUTH_ALLOWED_ORIGINS 값을 넣는다. 호스트를 혼용하지 않는다.
3. 요청에 Refresh 쿠키가 실제 전송됐는지 로컬에서 확인한다. 204·본문 없음·Max-Age=0 및 기존 Path/보안 속성을 확인한다.
   jar에서 ONTOP_REFRESH가 삭제되어야 한다. Access JWT는 프론트/Postman의 비공유 메모리에서도 지운다.
4. 같은 요청을 반복해도 204다. 기존 Refresh를 로컬 보안 입력으로 다시 보내 재발급하면 401이다.
   다른 로그인 jar에서는 재발급 200이 유지되어야 한다. 토큰 값을 공유하거나 콘솔에 출력하지 않는다.
5. DB에서는 본인 user_id + session_id의 revoked_at IS NULL 행 수가 0인지 확인한다.
   다른 계열의 행과 기존 폐기/회전 시각은 보존되어야 한다. 원문 쿠키·JWT·소셜 식별자는 조회/보고하지 않는다.
6. Origin 누락/위조는 403, 본문 `{}` 또는 중복 Refresh 쿠키는 400이다. 정상 쿠키로 재발급할 수 있어야 한다.
7. DB 장애 시 503이며 삭제 헤더가 없어야 한다. 장애가 해소되면 같은 로그아웃을 재시도한다.
   수동 장애 재현을 위해 기존 개발 DB/컨테이너를 삭제하거나 강제 종료하지 않는다.

## 자동화 검증

```powershell
# TEST_DB_*는 별도 loopback ontop_users80_test_ DB만 사용. ontop_dev 사용 금지.
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

AuthLogoutControllerTests는 204·쿠키 속성 일치·형식/Origin·DB 비활성·커밋 결과 불명 시 비노출을 검증한다.
AuthLogoutPersistenceServiceTests는 잠금 순서·이력 상태별 계열 폐기·누락/정합성 실패를 검증한다.
AuthLogoutMySqlTests는 실제 MySQL에서 다른 계열 보존·회전 이력 폐기·Rotation 경합·실제 UPDATE 롤백을 검증한다.
실제 HTTP CookieManager에서 삭제도 확인한다. 운영 브라우저 HTTPS/제3자 쿠키 검증과는 구분한다.
커밋 단계 DB 테스트는 대역이 실제 트랜잭션을 롤백하고 실패를 발생시키며, 결과 불명은 별도 단위 테스트로 검증한다.
실제 개발 DB 네트워크를 끊거나 기존 컨테이너/볼륨을 삭제하지 않는다.

기존 격리 DB/컨테이너를 재사용하고 auth62- 사용자·Refresh fixture는 그 테스트 DB에만 남긴다.
Flyway V1/V2/V3·DB 스키마는 변경하지 않는다. ontop_dev는 전후 읽기 전용 데이터 체크섬/이력으로 보존을 비교한다.

### 실제 검증 기록

2026-10-21, feat/S15P31B105-62-auth-logout, Java 21에서 전체 명령을 실행했다.

| 항목 | 결과 |
| --- | --- |
| clean build / 기본 test | 487개 통과 |
| flowTest | 실제 WebSocket 흐름 2개 통과 |
| mysqlTest | 기존 MySQL 8.4 테스트 DB에서 95개 통과 |
| AUTH-03 신규 테스트 | Controller 31개 + Persistence 단위 8개 + MySQL 19개 통과 |
| 실패/오류/건너뜀 | 모두 0 |
| git diff --check | 통과 |
| V1/V2/V3 / AUTH-04 | SQL·스키마·Rotation 구현 코드 변경 없음 |

기존 AuthSessionTests의 GET /logout 기대값을 API 미구현 404에서 POST 전용 405로 갱신했다.
기존 ontop-auth61-test-20261021-073629-ac72f0 컨테이너,
ontop_users80_test_auth61_20261021_073629_ac72f0 DB(127.0.0.1:49701)를 재사용했다.
신규 컨테이너/볼륨을 생성·삭제하지 않았다. auth62- 사용자와 Refresh fixture는 격리 테스트 DB에만 남긴다.
개발 DB ontop_dev는 작업 전후 users 2행·Refresh 9행, 데이터 체크섬과 V1/V2/V3 이력이 동일했다.
해당 DB에 앱/테스트/마이그레이션이나 데이터 변경을 실행하지 않았다.
실제 공급자 로그인·운영 브라우저 HTTPS/제3자 쿠키 검증은 실행하지 않았다.
테스트 XML을 기준으로 집계했으며 보고서는 backend/build/reports/tests/{test,flowTest,mysqlTest}/index.html에 있다.
