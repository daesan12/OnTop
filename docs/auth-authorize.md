# AUTH-01 소셜 로그인 시작

## 구현 경계와 구조

`GET /api/v1/auth/{provider}/authorize`는 소문자 `ssafy`, `naver`만 허용한다.
성공 시 본문 없는 HTTP 302와 `Location`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`를 반환한다.
AUTH-02에서 콜백·공급자 토큰/프로필 조회·회원 상태 판별·일회용 교환 코드 발급을 추가했다.
AUTH-01은 JWT·사용자 생성·온보딩·로그아웃을 담당하지 않는다. [콜백](auth-callback.md),
[인증 교환](auth-exchange.md), [USER-05](user-onboarding.md) 계약을 함께 참고한다.

기존 프로젝트에는 Spring Security/OAuth2 Client 의존성과 SecurityFilterChain,
공통 REST 오류 DTO·ControllerAdvice가 없었다. 기능별 DTO와 ResponseEntity를 사용하는 기존 방식을 따랐다.
이번 경계에서는 Spring MVC의 URI 빌더로 인가 주소를 명시적으로 구성한다.
SSAFY의 비표준 인가 경로를 명시적으로 처리한다.
사용자 인증 필터·의존성 추가와 전체 경로 permitAll 설정은 없다.
서비스 API 접근 제어가 완성된 것은 아니며 AUTH-02 이후 별도로 구성해야 한다.

| provider | 고정 인가 주소 | 쿼리 |
| --- | --- | --- |
| ssafy | `https://project.ssafy.com/oauth/sso-check` | `response_type=code`, `client_id`, `redirect_uri`, 서버 발급 `state` |
| naver | `https://nid.naver.com/oauth2.0/authorize` | 위와 동일 |

인가 endpoint는 코드의 상수이고, callback은 서버 설정만 사용한다. 요청의 `redirect_uri`, `returnUrl`,
`client_id`, `state` 등은 읽지 않는다. URI 변수 인코딩으로 값 내부의 `+`, `&`, `=`, 공백도 인코딩한다.
callback은 절대 HTTPS URI만 허용한다. `local` 프로필이 활성화된 경우에만
`http://localhost`, `http://127.0.0.1`, `http://[::1]` loopback 주소도 허용한다.
기본 프로필과 `dev`, `test`, `db`, `prod` 등 `local` 없는 실행에서는 HTTP callback을 500 설정 오류로 거절한다.
`local,db` 실행에는 기존 local 예외가 적용된다.
경로는 `/api/v1/auth/{provider}/callback`이어야 하고 userinfo·query·fragment는 허용하지 않는다.
프록시의 Host/X-Forwarded-*에서 callback을 만들지 않는다.

### 오류 계약

AUTH 전용 Advice가 아래 오류만 JSON으로 처리한다. 다른 기능의 오류 처리는 변경하지 않는다.
잘못된 provider 입력과 설정 원문은 응답에 반사하지 않는다. 오류 응답도 `no-store`다.

| HTTP | code | message |
| --- | --- | --- |
| 400 | `AUTH_UNSUPPORTED_PROVIDER` | 지원하지 않는 로그인 제공자입니다. |
| 500 | `AUTH_CONFIGURATION_ERROR` | 소셜 로그인 설정을 확인해 주세요. |

예: `{"code":"AUTH_UNSUPPORTED_PROVIDER","message":"지원하지 않는 로그인 제공자입니다."}`

Client ID 또는 callback의 필수값 누락·잘못된 URI는 해당 provider의 요청 시 500으로 실패한다.
OAuth 설정이 없어도 DB 없는 기본 실행과 WebSocket 개발은 가능하다.
설정 파싱 오류의 원인 예외에 포함될 수 있는 원문은 전달하거나 로그로 출력하지 않는다.

## 공통 OAuth state와 세션

- `SecureRandom` 32바이트(256비트)를 URL-safe Base64(패딩 없음, 43자)로 생성한다.
- state 해시·provider·만료 시각을 서버 메모리의 HttpSession에 보관한다. 세션 쿠키는 로그인 완료를 의미하지 않는다.
- 각 시도는 발급 후 5분간 유효하다. 같은 세션의 여러 탭·재요청을 위해 최대 10개를 독립 보관한다.
  11번째부터 가장 오래된 시도만 무효화하며, 해당 탭은 로그인을 다시 시작해야 한다.
- 만료 항목은 발급·소비 시 제거하며 세션 유휴 만료는 10분이다. 만료 판정 자체는 정확히 5분부터 적용한다.
- `OAuthStateStore.consume(request, provider, state)`는 같은 세션/provider의 유효한 값을 원자적으로 제거한다.
  한 번 성공한 state는 다시 사용할 수 없고 다른 세션/provider에서는 소비할 수 없다.
  AUTH-02의 성공·오류 callback에서 외부 토큰 교환 전에 호출한다.
- 세션 쿠키는 HttpOnly, SameSite=Lax, 기본 Secure, host-only, Path=`/api/v1/auth`다.
  USER-05는 독립 Bearer 토큰을 사용하므로 세션 쿠키 경로를 넓히지 않는다.
  URL 기반 세션 추적은 비활성화했다. `local`에서만 HTTP 개발을 위해 Secure=false다.
  실제 로그인을 시작할 때는 브라우저의 최상위 페이지 이동을 사용한다.
  SameSite=Lax는 NAVER에서 돌아오는 최상위 GET 콜백의 세션 전달을 위한 설정이다.
- Redis·DB 저장은 사용하지 않는다. 서버 재시작·세션 만료 후에는 로그인을 재시작해야 한다.
  여러 인스턴스를 운영하려면 세션 공유 또는 sticky session 방식을 먼저 결정해야 한다.

AUTH-02는 **성공·오류 콜백 모두** 새 세션을 만들지 않고 원래 세션의 state를 소비한다.
state 누락·불일치·만료·재사용은 토큰 교환 전에 거절한다. 오류 콜백에서도 시도를 소진한다.
인가 코드와 provider에 맞는 고정 token endpoint를 연결한다. 실제 로그인 확정 시 세션 고정 공격 방어는 후속 책임이다.

## SSAFY state 확인 범위

SSAFY 공식 문서에는 state/PKCE 지원 범위가 명시되지 않았다.
사용자가 정상 로그인 왕복에서 state 반환·일치를 관찰했다는 근거로 AUTH-02부터 SSAFY에도 state를 발급한다.
이번 구현 작업에서 실제 공급자 인증 요청이나 사용자 로그인은 수행하지 않았다.
오류·SSO 재사용 등 전체 반환 범위와 공식 지원은 미확인이다. PKCE 지원도 가정하지 않는다.

[OAuth 보안 권고 RFC 9700 §4.7](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.7)은
브라우저에 묶인 일회 state 또는 지원이 확인된 PKCE 등의 CSRF 방어를 요구한다.
SSAFY의 고정 callback, 세션 쿠키, 로컬 시도 기록만으로 반환된 code를 해당 브라우저의 인가 요청에
연결할 수 있다고 보장할 수 없다. SameSite만으로 로그인 주입을 해결했다고 볼 수 없다.

운영 전 다음을 공급자에게 확인하고 등록된 테스트 앱으로 검증해야 한다.

1. state 전달 및 성공·실패 응답에서 동일 값 반환을 지원하는지.
2. state가 없다면 PKCE(S256) 등 브라우저의 원래 시도와 응답을 연결할 수 있는 방식을 지원하는지.
3. 지원되는 방어가 없다면 SSAFY 콜백을 실제 로그인으로 확정하지 않고 공급자 협의·규격 변경을 결정한다.

state 누락·불일치 시 인증을 확정하지 않는다. 검증되지 않은 우회 방어를 추가하지 않는다.
SSAFY token·userInfo endpoint는 authorize에서는 호출하지 않고 AUTH-02 callback에서만 호출한다.

## 환경변수와 실행

| 환경변수 | AUTH-01 사용 | 값/기본값 |
| --- | --- | --- |
| `SSAFY_CLIENT_ID` | 필수 | 발급된 ID를 환경에서 주입. 기본값 없음 |
| `NAVER_CLIENT_ID` | 필수 | 발급된 ID를 환경에서 주입. 기본값 없음 |
| `SSAFY_REDIRECT_URI` | 필수 (`local` 기본값 있음) | `local`: `http://localhost:8080/api/v1/auth/ssafy/callback` |
| `NAVER_REDIRECT_URI` | 필수 (`local` 기본값 있음) | `local`: `http://localhost:8080/api/v1/auth/naver/callback` |
| `SSAFY_CLIENT_SECRET` | authorize 미사용 | AUTH-02 callback 필수. 환경에서만 주입 |
| `NAVER_CLIENT_SECRET` | authorize 미사용 | AUTH-02 callback 필수. 환경에서만 주입 |

비밀값은 파일·명령줄 인수·로그에 넣지 않는다. `.env`는 자동으로 읽지 않는다.
`local` 외에는 두 callback 환경변수에 공급자에 등록된 HTTPS 주소를 명시한다.
운영에서 로컬 loopback callback이 남아 있지 않은지 배포 설정을 확인한다.

PowerShell (`backend/`, JDK 21):

```powershell
$env:SSAFY_CLIENT_ID = Read-Host 'SSAFY Client ID'
$env:NAVER_CLIENT_ID = Read-Host 'NAVER Client ID'
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

브라우저에서 `http://localhost:8080/api/v1/auth/ssafy/authorize` 또는
`http://localhost:8080/api/v1/auth/naver/authorize`로 이동한다.
인가 시작과 callback의 호스트를 동일하게 사용한다. `127.0.0.1`에서 시작한 뒤
`localhost` callback으로 이동하면 host-only 세션 쿠키가 전달되지 않는다.
authorize는 인가 페이지로 이동한다. 실제 공급자 로그인 완료는 자동화 Mock 테스트와 구분한다.
헤더만 확인하려면(리다이렉트를 따라가지 않음):

```powershell
curl.exe --silent --show-error --output NUL --write-out '%{http_code}' http://localhost:8080/api/v1/auth/naver/authorize
```

위 명령은 상태 코드만 출력하여 Location의 state·세션 쿠키를 콘솔에 남기지 않는다.
DB와 함께 실행할 때만 기존 DB 환경변수를 주입하고 `--spring.profiles.active=local,db`를 사용한다.
DB 구성은 별도 [users 스키마 안내](users-schema.md)를 따른다.
JPA는 validate를 유지하며 현재 Flyway V1은 users만 생성한다.

## 검증과 운영 유의점

```powershell
.\gradlew.bat clean build
.\gradlew.bat flowTest
```

MockMvc로 두 provider의 302·쿼리 인코딩·등록 callback 고정·JSON 오류·설정 누락을 확인한다.
저장소 테스트는 난수 길이/중복·다중 탭·만료·용량 제한·다른 세션·일회 소비·동시 소비를 확인한다.
실제 내장 서버 테스트는 기본/local 쿠키 속성과 state 없는 콜백 400을 확인한다.
`NaverSessionRoundTripTests`는 HTTP authorize 응답의 Set-Cookie에서 세션 쿠키를 추출하고,
테스트 전용 `/api/v1/auth/naver/state-test-callback`으로 쿠키와 state를 재전송한다.
수신점은 `getSession(false)`로 기존 세션 및 요청 세션 ID의 일치를 확인하고 실제 OAuthStateStore를 소비한다.
동일 세션의 일회 소비·재사용 거절·다른 유효 세션·누락/무효 쿠키·잘못된 state의 거절을 검증한다.
이 수신점은 `src/test`에만 있으며 해당 테스트에서 명시적으로 등록한다.
운영 callback과 매핑이 겹치지 않는다. 이 테스트 자체는 외부 공급자 왕복을 수행하지 않는다.
쿠키를 명시적으로 재전송하는 HTTP 테스트이므로 브라우저의 SameSite 동작과 실제 HTTPS/TLS 검증은 별도다.
프로필별 callback 검증 테스트는 두 provider의 local·local,db HTTP loopback 허용과
기본·dev·test·db·prod의 HTTPS 전용 정책을 확인하며 실제 DB를 실행하지 않는다.
암호학적 비예측성은 SecureRandom 사용에 근거하며, 중복 검사만으로 이를 증명한다고 해석하지 않는다.
테스트는 외부 OAuth 서버·실제 DB를 호출하지 않는다. NAVER 검수 승인 및 공급자 연동은 별도 검증이다.

기존 `/ws/tables`, WebSocketUserResolver, VerifiedWebSocketUser와 인증 연결부는 수정하지 않았다.
이번 세션은 WebSocket 로그인 Principal을 만들지 않으며 기존 local 동작을 유지한다.
운영에서는 HTTPS를 사용하고 local 프로필을 활성화하지 않는다.
프록시·접근 로그에 Location, Cookie, callback의 code/state, Client Secret이 기록되지 않게 한다.
요청량 제한·분산 세션·향후 REST/WebSocket 접근 제어는 후속 작업에서 결정한다.

근거: [NAVER 인가 API 명세](https://developers.naver.com/docs/login/api/api.md),
[NAVER state/세션 안내](https://developers.naver.com/docs/login/web/web.md),
[Spring Boot 3.5 세션 쿠키 설정](https://docs.spring.io/spring-boot/3.5/reference/web/servlet.html).
