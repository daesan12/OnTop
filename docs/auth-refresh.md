# Access/Refresh 재발급 — S15P31B105-63 AUTH-04

## HTTP 계약

`POST /api/v1/auth/refresh`

- 인증 수단은 `ONTOP_REFRESH` HttpOnly 쿠키 한 개다. Authorization Bearer/JSESSIONID는 필요 없다.
- 본문은 비워 둔다. JSON `{}`·공백·form 등 본문이 있으면 400으로 거절한다.
- **Origin 헤더가 필수**이며 AUTH_ALLOWED_ORIGINS의 정확한 scheme/host/port와 일치해야 한다.
  브라우저는 Origin을 설정하며 Postman/서버 클라이언트는 허용된 값을 명시한다.
- 성공은 200이며 JSON 필드는 아래 세 개다. Refresh 원문은 JSON에 포함하지 않는다.

```json
{"accessToken":"<newAccessJWT>","tokenType":"Bearer","expiresIn":1800}
```

새 Refresh는 기존과 같은 ONTOP_REFRESH HttpOnly 쿠키로 전달한다. 성공·오류 모두 no-store/no-referrer다.
오류 응답은 `{code,message}`이며 새로운 쿠키나 쿠키 삭제 헤더를 보내지 않는다.
늦게 도착한 실패 응답이 다른 동시 요청의 새 쿠키를 덮어쓰지 않도록 하는 정책이다.

## Rotation과 저장

- Access는 기존 AccessJwtService의 HS256·사용자 ID 주체·access 목적 검증 계약과 30분 만료를 유지한다.
- Refresh는 `rt_` + 256비트 SecureRandom 난수다. DB에는 원문 전체의 SHA-256 해시만 보관한다.
- 새 Refresh의 session_id는 이전 행과 동일하다. 새 created_at부터 7일 후 expires_at을 설정한다.
- 재발급마다 슬라이딩하며 최초 로그인 기준 절대 만료는 없다. 다른 기기/로그인 세션에는 영향을 주지 않는다.
- 기존 행은 revoked_at/rotated_at에 같은 시각을 기록하고 새 행은 두 컬럼이 NULL이다.
- 폐기/회전 이력을 삭제하지 않는다. 보관·정리 정책은 후속 작업이다.
- 소셜 공급자 인증·OAuth 토큰 교환·온보딩 토큰 정책은 변경하지 않는다.

V3__add_refresh_token_rotation.sql은 기존 refresh_tokens에 nullable TIMESTAMP(3) rotated_at만 추가한다.
CHECK는 rotated_at이 있으면 revoked_at과 같고 created_at 이후인지 확인한다.
기존 V2 행의 rotated_at은 NULL로 남는다. V1/V2는 수정하지 않는다.
JPA는 ddl-auto=validate, Flyway만 스키마를 변경한다. 개발 앱을 db 프로필로 다음 실행하면 V3를 적용한다.
이번 자동화 검증은 격리 테스트 DB에만 적용하며 ontop_dev에는 앱/마이그레이션을 실행하지 않는다.

## 트랜잭션과 잠금

AuthRefreshPersistenceService.rotate는 REQUIRES_NEW 트랜잭션이다.

1. 해시로 user ID와 잠금 전 rotated_at 스칼라 projection을 읽는다. 엔티티를 1차 캐시에 남기지 않는다.
2. 기존 findForAuthenticationById로 회원 행을 잠근 뒤 findForUpdateByHash로 Refresh 행을 잠근다.
3. 회원 활성 상태와 최신 토큰 상태를 다시 확인한다. 탈퇴 행은 해당 세션을 폐기하고 401을 반환한다.
4. 사용 가능한 행을 회전 처리하고 기존 AuthExchangePersistenceService.issueForSession을 호출한다.
5. 기존 자격 정보 발급 함수는 MANDATORY로 참여한다. JWT 서명·이전 행 폐기·새 Refresh 해시 저장은 같은
   트랜잭션이다. saveAndFlush와 커밋 성공 이후에만 JWT/새 쿠키가 HTTP 계층에 전달된다.

같은 회원의 요청은 로그인 세션이 달라도 회원 잠금에서 잠시 직렬화된다. 폐기 범위는 user_id + session_id다.
같은 토큰 동시 요청은 하나만 회전하고 다른 요청은 401이다. 새 Refresh를 중복 발급하지 않는다.
[AUTH-03 로그아웃](auth-logout.md)도 이 잠금 순서와 세션 범위를 따른다.
회원 잠금 없이 Refresh부터 잠그면 데드락 위험이 있다.

DB 저장/JWT 발급 실패는 이전 폐기와 새 저장을 롤백한다. 자동 재시도는 하지 않는다.
재사용 탐지 시에는 예외 대신 거절 결과를 반환하여 **세션 폐기를 커밋한 뒤** 401로 바꾼다.
커밋 예외가 발생하면 503이며 새 인증 응답/쿠키를 전달하지 않는다.
연결 단절로 커밋 결과 자체가 불명인 경우 모든 실패가 롤백됐다고 보장하지 않는다.
클라이언트는 오래된 쿠키를 반복 전송하지 말고 새 OAuth 로그인을 이용한다.

DB 커밋·HTTP 전달은 원자적이지 않다. 커밋 후 응답을 잃으면 새 해시 행만 남을 수 있다.
원문을 DB에서 복구하거나 이전 토큰으로 같은 성공 응답을 재발급하지 않는다.
쿠키 헤더는 받았지만 본문만 잃은 경우 브라우저의 새 쿠키로 다시 재발급할 수 있다.
헤더까지 잃어 이전 쿠키만 남은 경우 새 로그인이 필요하다.

## 재사용 탐지·동시 요청·네트워크 재시도

서버가 사용하는 것은 Bearer 토큰이며 소유자의 기기를 증명하는 별도 키는 없다.
따라서 정상 요청과 탈취자의 요청을 완전히 판별할 수 없다. 이 한계는
[RFC 9700 §4.14.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)에서도 설명한다.
아래는 가용성과 재사용 탐지 사이에서 선택한 **시간/스냅샷 기반 정책**이며 탈취 여부의 확정 판정은 아니다.

| 잠금 후 상태 | 처리 |
| --- | --- |
| 활성·미회전·미만료 | 한 번 회전하고 200 |
| 회전됨, 잠금 전 스냅샷에서는 미회전 | 겹친 요청으로 취급, 401 AUTH_REFRESH_ALREADY_ROTATED, 추가 폐기 없음 |
| 회전됨, 요청 도착 시각이 rotated_at + 5초 이하 | 짧은 재시도로 취급, 같은 401, 추가 폐기 없음 |
| 회전됨, 위 두 조건 모두 아님 | 해당 세션의 활성 Refresh 전체 폐기 후 401 AUTH_REFRESH_REUSE_DETECTED |
| 일반 폐기·만료·미래 발급·알 수 없는 해시 | 401 AUTH_INVALID_REFRESH_TOKEN |

요청 도착 시각은 서비스 진입 시 DB 잠금 대기 전에 기록한다.
스냅샷이 미회전이면 5초가 넘게 잠금을 기다려도 늦은 재사용으로 취급하지 않는다.
5초는 고정 상수이며 반복 요청으로 시작점/토큰 만료를 연장하지 않는다.
유예 중에도 이전 토큰으로 JWT·Refresh를 추가 발급하거나 기존 성공 응답을 복구하지 않는다.
회전 이력이 있는 조상 토큰은 자체 만료가 지났더라도 재사용 탐지를 먼저 적용한다.
슬라이딩으로 유효기간이 남은 최신 후속 토큰까지 같은 세션 범위로 폐기한다.

주의 사항:

- 5초 이내의 공격자 재사용도 즉시 세션 폐기로 이어지지 않는다. 공격자가 먼저 회전하면 정상 사용자가
  이 기간에 시도해도 401만 받는다. 재인증이 필요하며 탐지가 완전하다고 설명하지 않는다.
- 5초가 지난 정상 네트워크 재시도도 세션 폐기를 유발할 수 있다. rotated_at은 트랜잭션 안의 회전 시각이므로
  비정상적으로 긴 커밋 후 즉시 재시도하는 경우에도 가능하다. 요청을 자동 반복하지 않는다.
- 프론트는 탭/요청 사이 재발급을 단일 실행으로 모으고 성공한 새 쿠키를 사용한다. 예전 쿠키를 캐시하지 않는다.
- Access JWT는 sid로 같은 로그인 계열을 따른다. 정상 Rotation은 기존 Access를 유지하며, 계열 전체 폐기는
  기존 Access도 차단한다. [S15P31B105-113](session-invalidation.md)의 DB 검증·연결 종료 계약을 따른다.
- 서버 UTC 시계 동기화가 필요하다. 로그인 절대 만료·sender-constrained 토큰·보관 정책은 도입하지 않았다.

## Cookie·Origin·CSRF

RefreshCookieService와 기존 환경변수를 그대로 재사용한다. host-only·HttpOnly·Path=/api/v1/auth·Max-Age=604800이다.
local HTTP에서만 Secure=false를 허용한다. 운영은 HTTPS/Secure가 필수이며 SameSite=None도 Secure가 필수다.
AUTH-03은 /api/v1/auth/logout이다. 쿠키 Path=/api/v1/auth는 유지하며 더 좁히는 방안은 별도 검토한다.

AuthRefreshOriginFilter는 POST/OPTIONS /api/v1/auth/refresh에만 적용한다.
기존 AuthExchangeOriginPolicy의 정확한 허용 Origin 검증을 재사용하고 Origin 누락/null/중복을 모두 거절한다.
Fetch Metadata만으로 Origin 검증을 대체하지 않는다. 허용된 다른 사이트 프론트의 cross-site 요청은 허용한다.
preflight는 POST와 Content-Type만 허용한다. 전역 CORS·OAuth·WebSocket 정책은 변경하지 않는다.
Origin/본문/쿠키 형식 거절은 DB 처리 전에 끝나며 정상 Refresh를 소비하지 않는다.
서비스 경계에서도 Origin 필수 검증을 반복하여 URL 인코딩/경로 파라미터로 필터 경로 비교를 건너뛰어도 차단한다.

89번 교환 API는 세션 결합 난수 코드를 추가로 검증하므로 Origin 없는 Postman 요청을 허용한다.
AUTH-04는 쿠키만으로 인증하므로 이 예외를 적용하지 않는다. Postman에도 허용된 Origin을 설정해야 한다.
정확한 출처 확인과 출처 없는 요청의 차단은
[OWASP CSRF 지침](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#using-standard-headers-to-verify-origin)을 참고했다.

프론트 fetch는 `credentials: 'include'`를 사용한다. 다른 사이트 배포는 실제 HTTPS,
AUTH_REFRESH_COOKIE_SAME_SITE=None, AUTH_REFRESH_COOKIE_SECURE=true와 브라우저 제3자 쿠키 제한을 확인한다.
신뢰한 Origin의 XSS/탈취는 이 방어로 막지 못한다. 프록시가 Origin을 임의로 추가/덮어쓰지 않게 한다.
토큰·쿠키·JWT·Authorization·소셜 식별자·비밀번호를 HTTP/APM/디버그 로그에 수집하지 않는다.

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | AUTH_INVALID_REFRESH_REQUEST | 본문이 있는 요청 |
| 401 | AUTH_INVALID_REFRESH_TOKEN | 쿠키 없음·중복·위조·만료·일반 폐기 |
| 401 | AUTH_REFRESH_ALREADY_ROTATED | 겹친 요청 또는 짧은 재시도, 새 인증/추가 폐기 없음 |
| 401 | AUTH_REFRESH_REUSE_DETECTED | 늦은 재사용 탐지, 해당 세션 폐기 커밋됨 |
| 401 | AUTH_MEMBER_STATE_CHANGED | 탈퇴 회원, 해당 세션 폐기 |
| 403 | AUTH_ORIGIN_NOT_ALLOWED | Origin/Fetch Metadata/preflight 거절 |
| 500 | AUTH_TOKEN_CONFIGURATION_ERROR | JWT/쿠키/Origin 설정 오류 |
| 503 | AUTH_REFRESH_STORAGE_UNAVAILABLE | db 비활성·조회/저장/커밋 장애 |

## 환경·실행

새 환경변수나 Secret 기본값은 없다. 기존 DB_URL/DB_USERNAME/DB_PASSWORD,
AUTH_JWT_SECRET_BASE64/AUTH_JWT_ISSUER, AUTH_ALLOWED_ORIGINS 및 AUTH_REFRESH_COOKIE_*를 사용한다.
로컬 Origin 기본값은 http://localhost:8080,http://127.0.0.1:8080이다. 실제 프론트 포트가 다르면 정확히 등록한다.
.env는 자동 로드하지 않는다. IntelliJ 비공유 실행 구성 또는 실행 셸에서 기존 변수들을 주입한다.

```powershell
# backend/, Java 21. DB/JWT/OAuth 변수는 값 출력 없이 사전 주입
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'
```

DB 없는 기본 실행을 유지한다. db 없이 유효 형식 쿠키로 재발급하면 503이며 임의 인증을 발급하지 않는다.

## Postman 수동 검증

1. 기존 회원으로 담당자가 직접 OAuth 로그인/89번 교환을 하거나 USER-05 가입을 완료한다.
   Postman의 API 호스트 cookie jar에 ONTOP_REFRESH가 있는지 **값을 공개하지 않고** 확인한다.
2. POST http://localhost:8080/api/v1/auth/refresh, Body=None, Authorization=None을 설정한다.
   `Origin: http://localhost:8080` 또는 실제 허용 목록의 Origin을 명시한다. localhost/127.0.0.1을 혼용하지 않는다.
3. 200의 세 응답 필드, expiresIn=1800, 새 Set-Cookie의 HttpOnly/Path/SameSite/Max-Age를 확인한다.
   쿠키 jar가 교체되며 다시 호출해도 200이어야 한다. JSESSIONID는 필요 없다.
4. DB에서 본인 세션의 이전 행 revoked_at=rotated_at, 새 행 동일 session_id·created_at+7일 expires_at,
   새 행 revoked_at/rotated_at=NULL을 확인한다. 원문 전체의 SHA-256 일치 여부만 로컬에서 비교한다.
5. 재사용 시험은 본인 테스트 세션에서만 한다. 예전 Refresh를 로컬 비공유 위치에 잠시 보관한 뒤 교체하여
   5초 이내 요청은 401 ALREADY_ROTATED, 5초 이후 요청은 401 REUSE_DETECTED인지 확인한다.
   후자는 최신 쿠키도 사용할 수 없으며 새 로그인이 필요하다. 다른 로그인 세션은 유지되어야 한다.
6. 잘못된 Origin/Origin 누락은 403, `{}` 본문은 400이며 그 뒤 원래 정상 쿠키 요청은 성공해야 한다.
7. Postman Console/응답 자동 저장/공유 환경에 실제 쿠키·JWT를 남기지 않는다. JWT를 외부 분석 사이트에 붙여넣지 않는다.

## 자동화 검증

```powershell
# TEST_DB_*는 ontop_users80_test_ 접두어의 별도 loopback DB로만 주입
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

AuthRefreshPersistenceServiceTests는 잠금 순서·5초 경계·긴 잠금 대기·회원 상태를 검증한다.
AuthRefreshControllerTests는 HTTP 계약·쿠키·Origin/CSRF·안전한 오류·커밋 결과 불명 시 비노출을 검증한다.
AuthRefreshMySqlTests는 실제 MySQL Rotation·슬라이딩·경합·세션 독립·재사용 폐기 커밋·실패 롤백·V3를 검증한다.
실제 HTTP CookieManager로 host/path가 같은 Refresh가 교체되어 두 번 재발급되는지 확인한다.
이는 실제 브라우저의 운영 TLS/제3자 쿠키 검증과는 구분한다.
커밋 실패 DB 테스트는 커밋 단계 대역이 실제 트랜잭션을 롤백하게 하고, 별도 단위 테스트는 결과 불명 예외를 검증한다.
실제 DB 네트워크를 끊거나 기존 컨테이너/볼륨을 삭제하지 않는다.

기존 격리 테스트 컨테이너/DB를 재사용하며 auth63- 사용자·Refresh fixture는 그 DB에만 남긴다.
ontop_dev의 사용자/Refresh 데이터와 Flyway V1/V2 이력은 작업 전후 읽기 전용 체크섬으로 비교한다.
검증 결과와 MR 준비 여부는 작업 완료 보고를 따른다.

### 실제 검증 기록

2026-10-21, feat/S15P31B105-63-auth-refresh, Java 21에서 위 전체 명령을 실행했다.

| 항목 | 결과 |
| --- | --- |
| clean build / 기본 test | 448개 통과 |
| flowTest | 실제 WebSocket 흐름 2개 통과 |
| mysqlTest | MySQL 8.4.11에서 76개 통과 |
| AUTH-04 신규 테스트 | Controller 31개 + Persistence 단위 12개 + MySQL 19개 통과 |
| 실패/오류/건너뜀 | 모두 0 |
| Flyway / JPA | V3 성공, validate 성공, 재실행 추가 적용 0 |
| git diff --check | 통과 |

기존 ontop-auth61-test-20261021-073629-ac72f0 컨테이너,
ontop_users80_test_auth61_20261021_073629_ac72f0 DB(127.0.0.1:49701)를 재사용했다.
신규 컨테이너/볼륨은 생성·삭제하지 않았다. 테스트 데이터는 이 격리 DB에만 추가했다.
ontop_dev는 작업 전후 users 2행·Refresh 3행, 각 데이터 체크섬 및 V1/V2 이력이 동일했다.
개발 DB에 V3를 적용하거나 테스트·데이터 변경을 실행하지 않았다.
기존 테스트 3개 파일은 V3에 맞춰 migration 버전/개수 기대값만 갱신했고 온보딩 정책은 변경하지 않았다.
실제 공급자 로그인·운영 브라우저 HTTPS/제3자 쿠키 테스트는 실행하지 않았다.
보고서는 backend/build/reports/tests/{test,flowTest,mysqlTest}/index.html에 있다.
