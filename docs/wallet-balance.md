# 본인 지갑 잔액 조회

## API 계약

`GET /api/v1/wallets/me`

- Access JWT와 ROLE_MEMBER가 필요하다. 기존 Spring Security가 서명/용도/만료와 활성 회원·로그인 세션 sid를 검증한다.
- 온보딩 Bearer, Refresh 쿠키, JSESSIONID로 일반 회원 인증을 대신할 수 없다.
- Body/Query 입력은 없다. 회원/지갑 ID를 바인딩하지 않으며 AuthenticatedUser.userId만 사용한다.
- 온보딩, 초기화, Shop과 동일한 Wallet Entity·WalletRepository를 사용한다.

HTTP 200:

```json
{
  "balance": 100,
  "reservedBalance": 0,
  "availableBalance": 100
}
```

세 필드는 Java long/JSON 정수(OpenAPI int64)다. balance는 예약액을 포함한 전체 보유 코인이다.
`availableBalance = balance - reservedBalance`이며 전액 예약이면 0이다. 실제 balance=0인 지갑과 미생성 상태를 구분한다.
회원 ID, 지갑 ID, 소셜 식별자, 인증 정보는 응답하지 않는다.

## 인증·오류·캐시

| HTTP | code | 상황 |
| --- | --- | --- |
| 401 | AUTH_AUTHENTICATION_REQUIRED | Access 인증 누락 |
| 401 | AUTH_INVALID_ACCESS_TOKEN | 위조/만료/잘못된 용도의 Bearer |
| 401 | AUTH_MEMBER_STATE_CHANGED | 회원 없음·탈퇴 또는 폐기된 sid |
| 403 | AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED | 기존 REST 출처·권한·요청 정책 |
| 409 | WALLET_NOT_READY | 활성 회원의 지갑 미생성. Shop과 같은 코드 |
| 500 | AUTH_TOKEN_CONFIGURATION_ERROR | 기존 JWT 설정 오류 |
| 503 | AUTH_MEMBER_LOOKUP_UNAVAILABLE | 인증 단계 회원/세션 DB 조회 불가 |
| 503 | WALLET_UNAVAILABLE | 지갑 조회·읽기 트랜잭션 장애, DB 구성 없음 또는 잘못된 레거시 잔액 |

오류는 기존 `{code,message}` 및 RestSecurityErrorHandler를 사용한다. DB 예외 원문을 응답·로그에 추가하지 않는다.
성공/오류 모두 Cache-Control: no-store, Referrer-Policy: no-referrer다. 읽기 API는 쿠키를 발급하지 않는다.
CORS/CSRF/Origin과 SecurityFilterChain은 변경하지 않았으며 기존 AUTH_ALLOWED_ORIGINS를 따른다.

## 구현과 읽기 경계

```text
Spring Security: Access JWT → 활성 회원/sid → ROLE_MEMBER
→ WalletController.me(@AuthenticationPrincipal AuthenticatedUser)
→ WalletQueryService.findBalance(userId)
→ WalletRepository.findByUserId(userId)
→ WalletBalanceResponse
```

- findByUserId에 `@Transactional(readOnly=true)`를 명시했다. 이 메서드 자체에는 쓰기 잠금이 없다.
- 기존 온보딩/초기화의 쓰기 트랜잭션에서 호출하면 REQUIRED로 참여하므로 그 트랜잭션을 분리하거나 읽기 전용으로 바꾸지 않는다.
- 조회 서비스는 지갑 초기화·보너스 지급·잔액 변경·원장 저장을 호출하지 않는다.
- 존재하지 않는 지갑을 0잔액으로 대체하지 않고 409로 반환한다.
- WalletQueryService는 UserProfileService처럼 ObjectProvider를 사용해 DB 없는 기본/local/dev 실행을 유지한다.
  실제 DB 인증은 기존 db 프로필이 필요하다. WalletController는 local 전용이 아니며 dev에도 등록된다.
- 이 API는 요청 시점의 인증·잔액 조회다. 동시 로그아웃/거래와 전체 요청을 직렬화하는 새 잠금 정책은 도입하지 않는다.

## Swagger와 테스트

- 태그 WALLET, AccessJwt 인증, 3개 응답 필드와 401/403/409/500/503을 문서화한다.
- 정적 docs/api/openapi.yaml은 기존 local HTTP export 절차로 생성한다. 거래 내역 추가 후 local 19개/dev 13개 operation이다.
- 단위: 초기/부분/전액 예약/0잔액/long 경계, 미생성, DB·트랜잭션 장애, 불변성.
- 실제 HTTP: Principal 기반 조회, 외부 ID 입력 무시, 누락·위조·만료·온보딩 Bearer 거절, sid/회원 비활성, 오류 캐시·민감정보 방지.
- 격리 MySQL + 실제 HTTP: 온보딩 최초100코인, 예약액0/30/100, 다른 회원 격리, 실제 로그아웃/탈퇴 차단,
  지갑·updated_at·원장 건수 보존, Shop 구매 후 80/30/50 조회.
- 테스트 전용 Hibernate StatementInspector로 조회의 읽기 전용 트랜잭션과 SELECT만 실행됨을 확인한다.
  FOR UPDATE/FOR SHARE/LOCK IN SHARE MODE가 없는지도 검사한다. 운영 코드에 SQL 기록 기능을 추가하지 않는다.
- 관련 초기화·온보딩·Shop·프로필 테스트를 선택 실행한다. 전체 회귀는 Wallet 도메인 MR 직전에 실행한다.

## 거래 내역 조회와의 공통 구성

Principal 기반 WalletController, WalletQueryService, 읽기 전용 Wallet 조회, WalletExceptionHandler 및
기존 WalletTransaction Entity/Repository를 재사용해 [거래 내역 조회](wallet-transactions.md)를 추가했다.
잔액 조회가 지갑 생성·지급을 수행하지 않는 경계는 거래 내역 조회에서도 유지한다.

## 2026-10-23 실행 결과

Java 21 / 실제 MySQL 8.4.11에서 관련 단위·HTTP·OpenAPI 76개, MySQL 통합 59개가 통과했다.
실패·건너뜀은 모두 0개다. 전체 회귀 및 수동 브라우저/Postman 검증은 실행하지 않았다.
실제 HTTP 서버·클라이언트와 MySQL로 조회/인증/읽기 전용 SQL/Shop 연동을 자동 검증했다.

기존 컨테이너에 새 격리 DB만 준비했다. 기존 ontop_dev의 테이블·회원·인증·이력 및 이전 Wallet 테스트 DB 2개의
행수는 검증 전후 동일했다. 기존 DB를 초기화하지 않았으며 새 검증 DB·계정도 삭제하지 않았다.

- ontop_users80_test_wallet_balance_20261023_105710_299687
- ontop_shop_test_wallet_balance_20261023_105710_299687

backend에서 테스트 환경변수를 안전하게 주입하고 실행한 명령:

```powershell
.\gradlew.bat test --tests '*WalletQueryServiceTests' --tests '*WalletControllerTests' --tests '*WalletHttpTests' --tests '*OpenApiLocalTests' --tests '*OpenApiDevTests' --tests '*UserProfileHttpTests' --tests '*UserProfileServiceTests' --tests '*ShopHttpTests' --tests '*WalletInitializationServiceTests' --console=plain
.\gradlew.bat mysqlTest --tests '*WalletBalance*MySqlTests' --tests '*WalletMySqlTests' --tests '*ShopMySqlTests' --tests '*UserOnboardingMySqlTests' --tests '*UserProfileMySqlTests' --console=plain
git diff --check
```

최초 OpenAPI export는 기존 절차대로 테스트 JVM에 `-Dontop.openapi.export=true`를 주입해 local 실제 HTTP YAML을
생성했다. V1~V4를 포함한 migration, Security 설정, AUTH/USER/Shop/Game/TableHub/WebSocket 운영 코드는 변경하지 않았다.

## 변경 파일 목록

- `README.md`
- `backend/src/main/java/com/ssafy/ontop/wallet/controller/WalletController.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/controller/WalletExceptionHandler.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/dto/WalletBalanceResponse.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/exception/WalletQueryException.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/repository/WalletRepository.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/service/WalletQueryService.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiHttpTestSupport.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/WalletBalanceMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/WalletBalanceShopMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/controller/WalletControllerTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/controller/WalletHttpTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/service/WalletQueryServiceTests.java`
- `docs/api/README.md`
- `docs/api/openapi.yaml`
- `docs/wallet-balance.md`
- `docs/wallet-initialization.md`
