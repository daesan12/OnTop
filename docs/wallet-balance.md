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

### 공원 잔액 표시 (2026-11-05)

- `fix/wallet-debit-sync`는 `origin/dev@2e336bc3405de8d139b284fcd14526eccb6dad7a`에서 분기했다. 푸시 직전 dev가 `86ab0c00`으로 변경되어 기존 이력을 보존하는 merge로 추가 반영했다. 충돌은 없었고 추가 dev 변경은 BE 월드 서비스의 운영 상태 주입 한 줄뿐이며 검증한 FE 소스는 동일하다. 기존 작업은 별도 worktree에 보존했다.
- 공원 HUD와 내 메뉴는 서버가 확정한 예약금을 제외한 사용 가능 잔액을 표시한다. 총액은 account.balance에 보존해 예약 해제와 실제 보상 입금을 구분한다.
- 게임 시작·대기실 복귀 및 확정 정산 시 GET을 다시 호출한다. 공원 루트의 `useWalletSync`가 동기화하므로 오목·알까기에서 잔액 UI가 언마운트되어도 동작한다. 요청 전 임의 차감이나 클라이언트 정산은 하지 않는다.
- 예: 100냥에서 판돈 30냥 예약 → 표시 70냥. 패배 정산은 총액 70/예약 0 → 표시 70냥, 승리는 총액 130/예약 0 → 표시 130냥, 무효 환불은 총액 100/예약 0 → 표시 100냥이다.
- 공통 변경: wallet 표시·파서, Session의 예약금 필드, AccountMenu/ParkPage, shop/wardrobe의 서버 지갑 동기화. 게임 규칙·서버 정산·DB·Flyway·FE/BE API 계약 변경은 없다.
- 검증: 관련 단위 37건, FE 타입 검사·빌드, Edge의 예약/패배/승리/무효 환불/정산 알림 누락 후 대기실 복구. HTTP/WS는 fixture이며 실제 서버 다인 플레이·운영 배포 확인과 구분한다.
- 독립 재현: frontend에서 기존 `pnpm dev --host 127.0.0.1 --port 5197 --strictPort`와 `pnpm exec playwright test tests/e2e/wallet-debit.spec.ts`. 이번 검수 서버는 5199, Edge 1280×720을 사용했다. Browser 플러그인이 없어 저장소 Playwright를 직접 실행했다.

### 최신 dev 재통합 (2026-11-06)

- 기준: `origin/dev@4f1b02f98cee6e0cb12623589fcd1701086b67b8`. 공유 작업 브랜치 `fix/wallet-debit-sync`에서 기존 이력을 보존하는 merge로 반영했다. 미커밋 변경이 없는 상태에서 시작했고 충돌은 없었다.
- 함께 변경된 `ParkPage.tsx`의 스피드 두더지 진입과 `wardrobe/state.ts`의 스킨 호환성 검사를 보존하면서 지갑 상시 갱신·예약금 동기화가 남아 있는지 확인했다. dev에 이미 있는 V151/V152는 그대로 통합했으며 이 작업에서 migration을 새로 만들거나 수정하지 않았다.
- 관련 단위 107건, 소스·테스트 타입 검사, FE 프로덕션 빌드 및 `git diff --check`를 통과했다. Edge 1280×720에서 예약→패배/승리/무효 환불/정산 알림 누락 후 복구 4건을 다시 통과했다. HTTP/WS fixture 검증이며 실제 서버·DB 검증은 포함하지 않는다.
- 최초 공원 로딩 전 잔액을 검사하던 e2e 대기를 공원 화면 진입 완료 기준으로 보완했다. MR !383을 갱신하며 dev로의 머지와 브랜치 삭제는 보류한다.

회원 ID, 지갑 ID, 소셜 식별자, 인증 정보는 응답하지 않는다.

### 리뷰 반영 — 동기화와 표시 분리 (2026-11-06)

- 작업 브랜치 `refactor/wallet-sync-root`, 시작 기준 `origin/dev@8e971321e2afe8a70e15ef556ce0f6bc301fe1c4`. 별도 worktree `wallet-sync-review-20261106`을 사용하고 기존 머지 브랜치는 Jenkins 결과 확인 전까지 보존한다.
- `WalletBalance`는 잔액·조회 상태를 표시한다. `ParkContent`의 `useWalletSync` 한 곳에서 예약·정산 구독, 재조회, 오류 복구, focus/online 복구를 관리하고 종료 시 요청·타이머·구독을 정리한다. `AccountMenu`는 경기 중 다시 언마운트할 수 있다.
- 상점·옷장은 기존에도 `createShopService.wallet`에서 정수와 잔액 공식을 검증했다. 이번에는 그 중복 검증을 `walletSnapshot` 호출로 통일하고 기존 ShopError 계약을 보존했다.
- 인접한 알림은 25ms 안에서 한 번으로 모은다. 진행 중 새 알림이 오면 낡은 요청을 한 번 취소하고 후속 조회 한 번으로 확인한다. 응답 순서가 역전되거나 공원을 종료하면 이전 응답을 반영하지 않는다.
- Edge 네트워크 측정: 예약 상태와 정산 알림 2개를 함께 공급했을 때 GET 1회. 느린 GET 중 정산 알림 2개는 기존 요청 취소 후 새 GET 1회로 처리하고, 느린 응답을 돌려주기 전에도 70냥 반영을 확인했다. 실제 서버 지연 측정이 아닌 HTTP/WS 및 store fixture 검증이다.
- 관련 단위 45건, 소스·테스트 타입 검사, 프로덕션 빌드, 브라우저 5건(기존 예약/패배/승리/무효/복구와 조회 횟수 측정)을 통과했다. 검사 서버는 `127.0.0.1:5199`, Edge 1280×720이다. DB·API·정산 규칙·migration 변경은 없다. 후속 MR만 생성하고 머지는 별도 요청 전 보류한다.
- 후속 MR !393 머지 요청 후 `origin/dev@ea9b7f012ac7fd762b7f7a02259cb8701afe6ec5`를 merge로 추가 반영했다. 충돌은 없었고 이동·반투명 관련 dev 변경을 보존했다. 단위 81건 통과, 경로 아티팩트 내보내기 환경변수 미설정으로 2건 건너뛰기, 소스·테스트 타입 검사·프로덕션 빌드·Edge 지갑 회귀 5건을 통과했다. 브라우저는 HTTP/WS 및 store fixture 검증이다. Jenkins 결과 확인 전까지 원격·로컬 브랜치를 보존한다.

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
