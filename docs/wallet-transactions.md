# 본인 코인 거래 내역 조회

## API 계약

`GET /api/v1/wallets/me/transactions?cursor=123&size=20`

- Access JWT와 `ROLE_MEMBER`, 활성 회원·로그인 세션 sid가 필요하다. 온보딩 Bearer는 사용할 수 없다.
- 인증된 `AuthenticatedUser.userId`의 지갑만 조회한다. userId/walletId를 입력받아 대상을 선택하지 않는다.
- cursor: 선택적인 양의 BIGINT 거래 ID. 생략하면 최신 거래부터 조회한다.
- size: 생략 시 20, 허용 범위 1~100.
- 빈 값·음수·0·소수·문자·중복 파라미터·범위 초과는 400이다. 숫자 앞뒤 공백도 허용하지 않는다.
- 모든 성공·오류 응답은 `Cache-Control: no-store`를 사용한다. 쿠키를 발급하거나 인증을 갱신하지 않는다.

```http
GET /api/v1/wallets/me/transactions?size=20
Authorization: Bearer <Access JWT>
```

200 응답 예시 (설명을 위한 값):

```json
{
  "transactions": [
    {
      "transactionId": 1,
      "transactionType": "SIGNUP_BONUS",
      "balanceDelta": 100,
      "reservedDelta": 0,
      "itemId": null,
      "gameSessionId": null,
      "minigameSessionId": null,
      "createdAt": "2026-10-23T10:00:00Z"
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

- `transactionId`, 금액 증감, 참조 ID는 Java long/Long, JSON integer(int64)다.
  JavaScript 클라이언트는 Number의 안전한 정수 범위(2^53-1)를 넘는 ID·금액에 유의한다.
- 참조 ID 세 개는 nullable이다. `createdAt`은 Entity의 Instant를 UTC로 직렬화하며 밀리초를 보존한다.
- 거래 유형은 원장의 String을 그대로 반환한다. 현재 생성 경로는 `SIGNUP_BONUS`, `SHOP_PURCHASE`다.
  이 조회로 게임 정산·보상 기능이나 새로운 거래 유형을 구현하지 않는다.
- idempotencyKey, userId, walletId, balanceAfter는 응답에 포함하지 않는다.
- 지갑은 있으나 원장이 없으면 `{"transactions":[],"nextCursor":null,"hasNext":false}`다.

## 페이지네이션과 소유권

1. `WalletRepository.findByUserId(Principal.userId)`로 지갑을 조회한다. 없으면 409다.
2. `WalletTransactionRepository.findHistory`는 해당 wallet_id 조건을 SQL에 포함한다.
3. cursor가 있으면 `id < cursor`, 정렬은 항상 `id DESC`다. cursor가 다른 지갑의 ID여도
   단순 ID 상한으로만 사용하며 그 지갑의 행을 조회하거나 존재 여부를 알려주지 않는다.
4. `PageRequest.of(0, size + 1)`과 List 결과를 사용한다. 전체 COUNT/offset 페이지 이동은 없다.
5. 한 건이 더 있으면 `hasNext=true`, 실제 반환한 마지막 ID를 nextCursor로 제공한다.
   더 없으면 `nextCursor=null`이다. 다음 요청에 받은 nextCursor와 원하는 size를 전달한다.

조회 사이 새로 추가된 큰 ID는 다음 페이지에 끼어들지 않는다. 새 내역을 보려면 cursor 없이 다시 조회한다.
여러 페이지를 하나의 DB 스냅샷으로 보장하지는 않는다. 향후 원장 수정·삭제나 ID 할당/커밋 순서가 뒤바뀌는
쓰기 경로가 추가되면 페이지 일관성을 별도로 검토해야 한다.

## 영속성·오류 처리

- 기존 V4의 `ix_wallet_transactions_wallet_id(wallet_id, id)`를 재사용한다. 마이그레이션 변경은 없다.
- 지갑 조회와 원장 조회는 각 Repository의 `@Transactional(readOnly=true)`를 사용한다.
  원장은 응답 DTO 생성자 투영으로 필요한 8개 필드만 읽는다. 연관 엔티티 로딩/N+1은 없다.
- 비관적 잠금, 지갑 초기화, 지급·차감·예약, 원장 INSERT/UPDATE/DELETE는 수행하지 않는다.
- 조회 서비스에서 Repository 트랜잭션 완료 실패까지 받아 기존 Wallet 예외로 변환한다.
  SQL·DB 접속 정보·예외 원문을 응답이나 로그에 전달하지 않는다.
- 서비스는 ObjectProvider로 DB 없는 기본/local/dev 시작과 호환된다. 실제 DB 인증·조회는 db 프로필이 필요하다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | WALLET_INVALID_PAGE_REQUEST | 잘못된 cursor/size |
| 401 | AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED | JWT·sid·회원 상태 오류 |
| 403 | AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED | 기존 REST 보안 정책 |
| 409 | WALLET_NOT_READY | 지갑 미생성. 0원/빈 원장으로 위장하지 않음 |
| 500 | AUTH_TOKEN_CONFIGURATION_ERROR | 기존 JWT 설정 장애 |
| 503 | WALLET_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE | 지갑·원장 또는 인증 DB 조회 장애 |

오류 본문은 기존 `{code,message}` 형식이다. WalletExceptionHandler와 RestSecurityErrorHandler를 재사용한다.
기존 Shop의 구매 트랜잭션·멱등 영수증·원장 기록 방식은 변경하지 않는다.

## Swagger와 자동 검증

- WALLET 태그, AccessJwt, cursor/size 범위·기본값, 페이지·nullable 참조 필드, 오류를 문서화했다.
- 기존 `exportOpenApi`로 `docs/api/openapi.yaml`을 갱신한다. local 19개/dev 13개 operation이다.
- 단위/실제 HTTP: 기본·최대 크기, lookahead, 마지막/빈 페이지, 잘못된 입력,
  토큰 누락·위조·만료·온보딩·sid 무효, 지갑 미생성 및 DB/읽기 트랜잭션 장애.
- 격리 MySQL/실제 HTTP: 온보딩 SIGNUP_BONUS, 구매 SHOP_PURCHASE, 다른 지갑 격리,
  20/100건 경계, 새 원장 추가 후 다음 페이지, UTC/밀리초·nullable 참조, 실제 로그아웃/탈퇴 차단.
- 테스트 전용 SQL inspector로 읽기 전용 SELECT, COUNT·쓰기 잠금·멱등키 로딩 없음,
  원장 쿼리 1회·LIMIT을 확인한다. 실제 인덱스 정의와 EXPLAIN도 확인한다.
- 조회 전후 지갑 전체 필드/원장 행 수 및 Shop 영수증을 비교한다.
  테스트 fixture에만 쓰기를 수행하며 기존 개발 DB에는 쓰지 않는다.
- 전체 회귀는 Wallet 도메인 MR 직전에 별도 실행한다. 자동 검증으로 대체되는 수동 테스트는 생략한다.

### 2026-10-23 실행 결과

Java 21 / MySQL 8.4.11에서 실행했다. 아래 명령은 backend 디렉터리 기준이다.

```powershell
.\gradlew.bat exportOpenApi --console=plain
.\gradlew.bat test --tests 'com.ssafy.ontop.wallet.service.*' --tests 'com.ssafy.ontop.wallet.controller.*' --tests 'com.ssafy.ontop.api.OpenApiLocalTests' --tests 'com.ssafy.ontop.api.OpenApiDevTests' --tests 'com.ssafy.ontop.auth.security.RestSecurityTests' --tests 'com.ssafy.ontop.shop.ShopHttpTests' --console=plain
.\gradlew.bat mysqlTest --tests 'com.ssafy.ontop.wallet.WalletTransactionsMySqlTests' --tests 'com.ssafy.ontop.wallet.WalletBalanceMySqlTests' --tests 'com.ssafy.ontop.wallet.WalletBalanceShopMySqlTests' --tests 'com.ssafy.ontop.shop.ShopMySqlTests' --tests 'com.ssafy.ontop.user.service.UserOnboardingMySqlTests' --console=plain
git diff --check
```

MySQL 명령에는 격리 DB만 가리키는 TEST_DB_URL/USERNAME/PASSWORD 및 TEST_SHOP_DB_URL/USERNAME/PASSWORD를
프로세스 환경변수로 별도 주입했다. 비밀번호는 출력하지 않았으며 문서에 기록하지 않는다.

| 구분 | 통과 | 실패 | 건너뜀 |
| --- | ---: | ---: | ---: |
| 선택 단위·HTTP·REST Security·Shop HTTP·local/dev OpenAPI | 141 | 0 | 0 |
| 선택 MySQL (원장 9, 잔액 9, Shop 연동 1, Shop 19, 온보딩 17) | 55 | 0 | 0 |
| exportOpenApi (위 local 테스트와 중복) | 9 | 0 | 0 |

처음에는 정적 명세 미갱신 비교 1개가 실패했다. 기존 export 절차로 해결했다.
추가로 실행한 REST 보안의 매핑 목록 기대값에 기존 Wallet 잔액 및 신규 거래 조회가 누락되어 1개가 실패했다.
실제 보안 설정을 바꾸지 않고 기대 목록과 접근 정책 문서를 갱신한 뒤 위 최종 결과를 확인했다.
실패한 테스트를 제외하거나 비활성화하지 않았다. 전체 build/flowTest/전체 mysqlTest는 실행하지 않았다.

기존 `ontop-auth61-test-20261021-073629-ac72f0` 컨테이너(127.0.0.1:49701)에 다음 새 DB만 준비했다.

- `ontop_users80_test_wallet_history_20261023_111415_b65384`: 기본 V1~V4 적용 성공, JPA validate 성공.
- `ontop_shop_test_wallet_history_20261023_111415_b65384`: 기본 V1~V4 및 선택적 Shop V100 적용 성공.

새 테스트 전용 사용자는 이 두 DB에만 권한을 갖는다. 컨테이너·볼륨을 추가하거나 삭제하지 않았다.
이전 검증 DB를 테스트 대상으로 재사용하지 않았다. 새 DB와 테스트 데이터는 삭제하지 않고 보존했다.
연결 정보와 DPAPI 암호화 자격증명은 Git 제외 경로 `.gradle/wallet-history-verification`에 보관했다.
개발 DB `ontop_dev`에는 읽기 전용 조회만 수행했고, 전후 테이블 목록과 users/refresh_tokens/Flyway 행 수가 같았다.
이는 전체 행의 바이트 단위 비교를 의미하지 않는다.

### 변경 파일

운영 코드:

- `backend/src/main/java/com/ssafy/ontop/wallet/controller/WalletController.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/service/WalletQueryService.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/repository/WalletTransactionRepository.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/exception/WalletQueryException.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/dto/WalletTransactionPageRequest.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/dto/WalletTransactionPageResponse.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/dto/WalletTransactionResponse.java`

테스트:

- `backend/src/test/java/com/ssafy/ontop/wallet/service/WalletTransactionQueryServiceTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/service/WalletQueryServiceTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/controller/WalletTransactionsHttpTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/WalletTransactionsMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/WalletBalanceShopMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiHttpTestSupport.java`
- `backend/src/test/java/com/ssafy/ontop/auth/security/RestSecurityTests.java`

문서:

- `docs/wallet-transactions.md`, `docs/wallet-balance.md`, `docs/rest-authentication.md`
- `docs/api/README.md`, `docs/api/openapi.yaml`, `README.md`

## 후속 게임 연동

예약·해제·정산 서비스는 이 조회에 포함하지 않는다. 게임 담당자와 거래 유형, 증감 부호,
멱등키, 참조 ID, 잔액/원장 원자성 및 지갑 잠금 순서를 합의한 뒤 기존 공통 원장에 기록해야 한다.
기록되지 않은 balanceAfter를 이력 조회에서 역산하지 않는다.
