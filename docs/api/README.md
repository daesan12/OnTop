# OnTop REST API 문서

Controller·서비스·DTO를 확인한 현재 구현 명세다. 기획서로부터 API를 추가하지 않는다.
정적 [openapi.yaml](openapi.yaml)은 **local 프로필의 실제 `/v3/api-docs.yaml` 응답**이며 수동 편집하지 않는다.
WebSocket은 [websocket.md](websocket.md)를 사용한다.
USER-03/Swagger별 실행 결과와 변경 파일 전체는 [MR 전 검증 기록](verification.md)에 정리했다.

## 실행과 버전

- Java 21 / Spring Boot 3.5.16 / springdoc-openapi-starter-webmvc-ui **2.8.17**.
- 공식 [Boot 호환 표](https://springdoc.org/v2/#what-is-the-compatibility-matrix-of-springdoc-openapi-with-spring-boot)는
  Boot 3.5.x에 springdoc 2.8.x를 제시한다. [2.8.17 릴리스](https://github.com/springdoc/springdoc-openapi/releases/tag/v2.8.17)는
  Boot 3.5.13 기반이며 기존 프로젝트의 Boot/Security 버전을 바꾸지 않았다.
- 제목 `OnTop API`, 설명 `OnTop REST API Documentation`. 버전은 Gradle `version`에서 생성한 BuildProperties를 사용한다.
- 서버 `/`는 문서를 연 현재 서버다. 고정 운영 URL이나 로컬 테스트 포트를 명세에 넣지 않는다.

프로젝트 루트에서:

```powershell
cd backend
# 문서 열람만: DB·OAuth/JWT 비밀값 없이 실행 가능
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
# 실제 회원 API 검증: 기존 안전한 환경변수 주입 후 실행
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'
```

| 기능 | 기본 포트에서의 주소 |
| --- | --- |
| Swagger UI | http://localhost:8080/swagger-ui/index.html |
| OpenAPI JSON | http://localhost:8080/v3/api-docs |
| OpenAPI YAML | http://localhost:8080/v3/api-docs.yaml |

`.env` 파일은 Spring Boot가 자동 로드하지 않는다. IntelliJ Run Configuration 또는 프로세스 환경변수로 주입한다.
실제 기능에는 기존 DB_URL / DB_USERNAME / DB_PASSWORD, AUTH_JWT_SECRET_BASE64 / AUTH_JWT_ISSUER,
AUTH_ALLOWED_ORIGINS 및 OAuth별 기존 설정이 필요하다. 값은 이 문서·YAML·명령에 기록하지 않는다.
문서 서버 Origin도 AUTH_ALLOWED_ORIGINS에 포함해야 브라우저 POST의 기존 출처 검증을 통과한다.
예: 로컬 기본 실행은 기존 `http://localhost:8080,http://127.0.0.1:8080` 기본값을 사용한다.

## 환경 및 SecurityFilterChain

| 활성 프로필 | UI / OpenAPI |
| --- | --- |
| 기본 / db 단독 / 기타 | 비활성 |
| local 또는 local,db | 활성 |
| dev 또는 dev,db | 활성 |
| prod / production 및 이를 포함한 혼합 프로필 | 비활성·접근 차단 |

application.yml은 기본 enabled=false, `(local | dev) & !prod & !production`에서만 true다.
문서 전용 체인은 Order **-1**로 UI/문서 경로만 처리한다. 프로필 조건과 api-docs.enabled가 충족될 때만 공개한다.
운영 프로필에서 외부 설정으로 enabled=true를 강제해도 이 체인이 접근을 거절한다.
기본 운영 구성은 springdoc HTTP 매핑 자체가 없고, 문서 URL 요청은 기존 JSON 형식의 401로 차단된다.
`/api/v1/**` 인가, OAuth 세션/회전, 닉네임 혼합 인증, Origin/CORS 및 쿠키 정책은 변경하지 않았다.
문서 체인은 Stateless/NullSecurityContextRepository이며 OAuth의 별도 NEVER 체인에 영향을 주지 않는다.
보안 헤더는 기존 Spring Security 기본값을 유지한다. 문서 활성화가 게임/상점 운영 준비 완료를 뜻하지 않는다.

## 완료되어 문서화한 API

| 도메인 | 메서드·경로 | 인증 | 성공 |
| --- | --- | --- | --- |
| Auth | GET /api/v1/auth/{provider}/authorize | 시작은 공개, ssafy/naver만 | 302 |
| Auth | GET /api/v1/auth/{provider}/callback | 동일 OAuth 세션 + state/provider | 200 또는 302 |
| Auth | POST /api/v1/auth/exchange | 60초 일회용 코드 + 동일 OAuth 세션 | 200 |
| Auth | POST /api/v1/auth/refresh | Refresh 쿠키 + 필수 Origin | 200 |
| Auth | POST /api/v1/auth/logout | Refresh 쿠키(누락도 멱등 처리) + 필수 Origin | 204 |
| Auth | POST /api/v1/auth/websocket-ticket | Access JWT + Origin 정책 | 200 |
| User | GET /api/v1/users/me | Access JWT | 200 |
| User | PATCH /api/v1/users/me | Access JWT | 200 |
| User | DELETE /api/v1/users/me | Access JWT | 204 |
| User | GET /api/v1/users/nickname-availability | Access JWT **또는** 온보딩 Bearer | 200 |
| User | POST /api/v1/users/onboarding | 온보딩 Bearer | 201 |
| WALLET | GET /api/v1/wallets/me | Access JWT·활성 sid | 200 |
| WALLET | GET /api/v1/wallets/me/transactions | Access JWT·활성 sid | 200 |
| Channel | GET /api/v1/channels | Access JWT | 200 |
| Table | GET /api/v1/tables?channelId=… | Access JWT (회원 인증 기본 모드) | 200 |
| Shop | GET /api/v1/shop/items | Access JWT | 200 |
| Shop | POST /api/v1/shop/purchases | Access JWT + Idempotency-Key | 200 |
| Shop | GET /api/v1/users/me/items | Access JWT | 200 |
| Shop | PATCH /api/v1/users/me/equipment | Access JWT | 200 |
| Ranking | GET /api/v1/rankings | Access JWT | 200 |
| Park Ranking | GET /api/v1/rankings/park | Access JWT | 200·503 |
| Minigame | POST /api/v1/minigames/sessions | Access JWT + Idempotency-Key | 201 |
| Minigame | POST /api/v1/minigames/skewer/admissions | Access JWT + Idempotency-Key · 본인 지갑 이용료 10냥 | 201 |
| Minigame | GET /api/v1/minigames/sessions | Access JWT | 200 |
| Minigame | GET /api/v1/minigames/sessions/{sessionId} | Access JWT·본인 세션 | 200 |
| Minigame | POST /api/v1/minigames/sessions/{sessionId}/complete | Access JWT·본인 세션 | 200 |
| Minigame | POST /api/v1/minigames/sessions/{sessionId}/abandon | Access JWT·본인 세션 | 200 |
| Minigame | POST /api/v1/minigames/sessions/{sessionId}/manual-pause | Access JWT·본인 세션·일시정지 버전 | 200 |
| Feedback | POST /api/v1/feedback | Access JWT·위치/활동 검사 | 201 |
| Feedback | GET /api/v1/admin/feedback | Access JWT·서버 관리자 ID 목록 | 200 |
| Notes | POST /api/v1/notes | Access JWT·위치/활동 검사 | 201 |
| Notes | GET /api/v1/notes | Access JWT·위치/활동 검사 | 200 |

정적 export는 OpenApiLocalTests가 Feedback/Notes를 켠 실제 local 문서에서 생성한다.
local/dev의 endpoint 목록은 해당 기능 플래그 조건에 따라 OpenAPI·보안 회귀 테스트에서 정확히 비교한다.
꼬치왕 이용권 API의 서버 계약과 중복 차감 방지는 [꼬치왕 이용료 계약](../skewer-admissions.md)을 따른다.
WebSocket 인증을 local에서 명시적으로 끄면 Ticket API 1개가 제외된다.
Shop/Minigame/Notes는 local/dev 또는 운영 `prod,db`에서 기능별 설정으로 등록할 수 있다. 운영 배포에서는 기본 비활성이다. Feedback는 별도 기능 플래그를 따른다.
Channel/Table 조회는 운영에서도 인증된 회원에게 제공한다.
Feedback/Notes는 Controller 등록도 기능 플래그를 요구한다. 그 외 Controller가 보여도
DB와 서비스 Bean이 없으면 기능 호출은 503일 수 있다. prod 혼합에서는 문서 자체를 공개하지 않는다.
ChannelQueryService는 실제 등록 채널과 현재 presence를, TableHub는 실제 테이블 상태와 맵 앵커를 조회한다.
ShopService/ShopRepository는 실제 지갑 잠금·구매 원장/멱등 영수증·보유/장착 트랜잭션을 구현한다.
상점 서비스는 추가로 local/dev와 db, `ontop.shop.enabled=true`, 별도 상점 스키마와 지갑이 필요하다.
기본 V1~V4는 공통 Wallet까지 포함하지만 상점 테이블은 만들지 않는다. 상점 구성/지갑이 없으면
SHOP_NOT_CONFIGURED(503) 또는 WALLET_NOT_READY(409)다. 온보딩 최초100코인·기존 회원 초기화는
[공통 지갑 문서](../wallet-initialization.md)를 따른다.
이 문서 작업은 상점 테이블·지갑을 새로 만들거나 기능을 활성화하지 않는다.

### 제외·운영 준비 구분

- `/dev/tables`, `/dev/world-config`: 개발 화면/설정이므로 `@Hidden` 및 API 경로 필터로 제외. 라우팅은 유지한다.
- `/ws/tables`: HTTP REST operation이 아니므로 별도 WebSocket 문서에 기록한다.
- `/actuator/health`: 별도 관측 엔드포인트. 기존 공개 정책은 유지하며 도메인 명세에서는 제외한다.
- Wallet [잔액 조회](../wallet-balance.md)와 [거래 내역 조회](../wallet-transactions.md)를 구현했다. Wallet 생성 전용 REST 및
  기획서상의 추가 상점/게임 REST는 추가하지 않았다.
  온보딩 내부의 지갑 생성·가입 보너스는 기존 온보딩 operation 설명에 반영한다.
- 문서화하는 API는 실제 Controller 매핑이며 등록 조건·선택적 서비스 미등록과 기능 완료 여부를 구분한다.
- 경기 예약·정산·INVALID 반환은 내부 이벤트/Raw WebSocket 계약이다. REST 생성·승리 신고·정산 API를 만들지 않았다.
  현재 boot의 종결 복구와 다른 boot의 미완료 경기 자동 반환을 구분한다. 후자는 미구현이다.

### 문서 스키마 해석

- 응답 required는 JSON 필드의 존재, nullable은 그 필드의 null 허용이다. 둘은 독립적이다.
- Shop/Minigame/Feedback/Notes 오류는 도메인별 스키마를 사용한다. 인증 필터 오류는 AuthErrorResponse이며
  동일 상태에서 둘 다 가능한 경우 anyOf로 표시한다. 런타임 오류 응답을 통합하지 않았다.
- Feedback/Notes는 원문과 정규화 후 UTF-16 길이를 검사한다. OpenAPI minLength/maxLength의
  Unicode 코드포인트와 다르므로 x-utf16-max-length, x-normalized-utf16-min-length 및 설명을 사용한다.
  NFC·제어/Cf 제거·JS trim 이후 검증은 서버가 최종 판단한다. 이 확장은 SDK의 자동 검증을 보장하지 않는다.
- Minigame seenTips는 최대 5개 배열이며 유효한 문자열 키만 기억하고 나머지 값은 무시한다.
  상태 GET의 만료 세션 갱신도 기존 동작이다. 문서 작업에서 검증/트랜잭션을 변경하지 않았다.

## 인증 수단과 Swagger 사용

### AccessJwt

Authorize의 **AccessJwt**에 실제 테스트 로그인의 Access JWT만 입력한다(`Bearer ` 접두사 제외).
HS256/서명/Issuer/Audience/typ/token_use/crit/수명·sid 검증 후 활성 회원과 로그인 계열을 DB에서 확인한다.
누락·위조·만료·잘못된 용도·탈퇴·로그아웃한 sid는 401, 인가 실패는 403, 회원 DB 장애는 503이다.
보호 REST에 온보딩 토큰을 넣어도 일반 회원으로 인증되지 않는다.
113번 이후에는 sid 없는 레거시 JWT도 거절하며, 로그아웃한 sid의 기존 Access JWT는 만료 전이라도 차단한다.
Swagger UI의 Authorize 값은 영구 저장하지 않는다(`persist-authorization=false`).

### OnboardingBearer

신규 소셜 로그인 → exchange의 ONBOARDING_REQUIRED에서 받은 **opaque** 토큰이다. JWT가 아니다.
Authorize의 OnboardingBearer에만 입력하고 AccessJwt는 비운다. 두 Bearer를 동시에 입력하지 않는다.
600초 독립 Bearer이므로 JSESSIONID가 필요 없다. 닉네임 조회는 소비/만료 연장/예약하지 않는다.
온보딩은 nickname·characterGender만 받는다. nickname은 완성형 한글/영문/숫자 2~8자,
대소문자 무시 중복 금지(탈퇴 회원 포함), MALE/FEMALE은 생성 후 수정하지 않는다.
회원 생성·Refresh 저장 커밋 뒤 201, profile + Access JWT 및 HttpOnly Refresh 쿠키를 발급한다.
확인된 닉네임 409 + 확인된 롤백만 같은 토큰으로 재시도 가능하며 최초 600초는 유지한다.
중복 소셜 계정/그 외 소비 이후 실패/커밋 불명은 새 OAuth를 진행한다. 입력 형식 사전 거절은 토큰 선점 전이다.
성공 커밋 후 HTTP 응답 유실은 가입을 되돌리지 않으므로 다시 OAuth 로그인하여 기존 회원 흐름을 이용한다.

### RefreshCookie / OAuthSession

- Refresh는 7일 슬라이딩 만료·매번 Rotation·SHA-256 해시 보관, HttpOnly 기본 Path `/api/v1/auth`다.
  local 기본 Secure=false, 비local 기본 Secure=true이며 기존 SameSite/Path 설정을 그대로 따른다.
- Refresh/Logout은 Origin 필수다. 동일 출처도 AUTH_ALLOWED_ORIGINS에서 허용되어야 한다.
  Exchange/Onboarding/Ticket은 기존 비브라우저 Origin 누락·Fetch Metadata 정책을 그대로 적용한다.
- 회전된 이전 Refresh는 401. 5초 이내 정상 경합/재시도는 추가 계열 폐기 없이 거절하고,
  이후 재사용은 해당 sid를 폐기한다. Logout은 다른 기기를 유지하고 해당 sid만 폐기한다.
- UI는 withCredentials=true로 브라우저가 이미 가진 쿠키를 전송한다. **Authorize의 cookie 입력으로 HttpOnly
  쿠키를 임의 생성/읽기할 수 없다.** 브라우저 보안상 Cookie 헤더·Origin도 스크립트가 자유롭게 설정하지 못한다.
  쿠키 기반 테스트는 실제 동일 브라우저 로그인 후 수행하거나 Postman cookie jar로 검증한다.
  [Swagger 공식 제한](https://swagger.io/docs/specification/v3_0/authentication/cookie-authentication/)을 참고한다.
- 실제 OAuth는 브라우저에서 authorize URL로 **탐색**한다. Swagger fetch에서 공급자 302를 따라가면 외부 CORS 등의
  제한이 있으므로 성공 로그인 재현 수단이 아니다. SSAFY/NAVER 계정을 자동 로그인하거나 가짜 callback을 만들지 않는다.
- callback은 동일 JSESSIONID와 provider/state를 검증한다. AUTH_FRONTEND_CALLBACK_URI 설정 시
  `#exchange_code=…`로 이동한다. 미설정 JSON은 로컬 수동 테스트 계약이며 배포 프론트 흐름의 대안으로 가정하지 않는다.
  60초 안에 같은 세션으로 exchange하고 이후 JSESSIONID가 회전함을 반영한다.
- SSAFY state 정상 왕복은 기존 검증에서 관찰되었지만 공식 전체 지원 범위는 미확정이다.
  NAVER 검수 대기와 실제 사용자 인증 완료 여부는 자동화 Mock 공급자 테스트와 구분한다.

## User 탈퇴 및 오류

DELETE는 Soft Delete + 모든 Refresh 계열 폐기를 한 트랜잭션에서 수행하고 커밋 후 모든 연결을 4403으로 종료한다.
기존 AUTH callback의 탈퇴 **7일 이내 복구는 구현**, **7일 초과는 AUTH_REJOIN_PENDING(409)** 이다.
7일 초과 신규 가입/영구 삭제/소셜 UNIQUE 해제는 구현하지 않는다. 소셜키·닉네임과 연관 데이터는 보존한다.

Auth/User/Security 오류는 `{code,message}`다. 닉네임 중복은 `USER_NICKNAME_ALREADY_EXISTS`(409),
잘못된 닉네임은 `USER_INVALID_NICKNAME`(400), GM 접두어는 `USER_RESERVED_NICKNAME`(400),
욕설·비속어 금칙어는 `USER_INAPPROPRIATE_NICKNAME`(400, 조회·온보딩·닉네임 수정 공통),
탈퇴 DB 실패는 `USER_WITHDRAWAL_UNAVAILABLE`(503)이다.
기존 Channel/Table/Shop 오류에는 `details:null`이 추가되며, Minigame·Feedback·Notes의 추가 오류 필드도 각각 구분한다.
각 operation에 실제 DTO·허용 요청 필드·성공/오류 상태·주요 code·Cache-Control/Set-Cookie/Location을 기술한다.
토큰/쿠키·회원 상태에 따른 응답은 캐시하지 않는다.

## 정적 명세 생성·비교

```powershell
cd backend
# 테스트 전용 랜덤 포트의 실제 local 애플리케이션에서 YAML 요청 후 파일 갱신
# DB·OAuth 호출·실제 인증 값 불필요
.\gradlew.bat exportOpenApi --console=plain
# 파일을 수정하지 않고 현재 컨트롤러 생성 결과와 정적 YAML 비교 + UI/프로필/보안 검증
.\gradlew.bat test --tests 'com.ssafy.ontop.api.*' --console=plain
git diff --check
```

exportOpenApi는 OpenApiLocalTests를 별도 Test task로 실행하여 `/v3/api-docs.yaml`의 원문을 LF로 저장한다.
OpenAPI YAML과 JSON을 파싱해 트리를 비교하므로 객체 키 순서/줄바꿈은 비교 대상이 아니다.
서버 `/`로 환경별 랜덤 포트 차이를 제거하고, `$ref` 연결·정확한 endpoint 목록·DTO와 인증 스키마·민감 필드를 검사한다.
공식 swagger-parser로 스키마 오류/경고가 없는지도 확인한다. test 전용 parser의 javax Swagger core는 제외하여
실제 springdoc Jakarta core와 중복되지 않게 했다. 기본 test는 파일이 없거나 드리프트가 있으면 실패한다.
정적 파일은 local export 기준으로 비교한다. dev도 같은 기능 플래그 조건의 매핑을 별도로 검사하며,
local 전용 개발 화면 2개는 두 환경의 REST OpenAPI 범위에 포함하지 않는다.

## 수동 검증과 배포 확인

1. local,db 실행 후 실제 테스트용 소셜 로그인·exchange를 진행한다. 토큰은 채팅/공유 로그에 기록하지 않는다.
2. AccessJwt Authorize → GET me 200, PATCH nickname 200. 비우거나 위조·만료/온보딩 토큰이면 401.
3. 신규 OnboardingBearer로 닉네임 조회 → 200; 온보딩 201 후 같은 토큰은 401. 닉네임 충돌 409 후 다른 이름 재시도 가능.
4. 실제 브라우저 쿠키 또는 Postman jar + Origin으로 refresh 200/새 쿠키, logout 204/삭제 쿠키를 확인한다.
5. 로그아웃한 Access는 GET me와 ticket에서 401. DELETE me 204 후 모든 sid·미사용 접속권 차단 및 WS 4403을 확인한다.
6. UI에서 DELETE/구매를 실행하면 실제 해당 테스트 계정 데이터가 변한다. 검증용 DB/계정만 선택한다.
7. 운영은 local/dev를 활성화하지 않는다. prod/production 문서 경로 차단, 외부 프록시 경로/Host,
   HTTPS·Secure·SameSite·쿠키 Path, 프론트 Origin과 credentials를 실제 배포 브라우저에서 확인한다.
   OpenAPI의 cookie security 선언은 실제 브라우저 쿠키 정책을 대체하지 않는다.

자동화 테스트는 문서 HTTP 서버와 테스트 토큰/대역 또는 기존 격리 MySQL만 사용한다.
실제 외부 OAuth 사용자 로그인/프록시/운영 브라우저 쿠키 검증 완료를 의미하지 않는다.
