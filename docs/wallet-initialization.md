# 공통 지갑 스키마 및 회원 지갑 초기화

## 범위와 확정 정책

- 신규 회원은 USER-05 온보딩에서 지갑과 최초 **100코인**을 받는다.
- `balance`는 전체 잔액, `reserved_balance`는 그중 예약된 금액이다. 사용 가능 잔액은 두 값의 차이다.
- 최초 원장은 `SIGNUP_BONUS`, balance_delta=100, reserved_delta=0, `idempotency_key=signup:<내부 userId>`다.
- OAuth 성공/인증 교환/로그인/계정 복구/조회에서는 지갑을 생성하거나 보너스를 지급하지 않는다.
- 초기화 Story에는 지갑 조회 REST를 포함하지 않았다. 후속 구현한 [본인 잔액 조회](wallet-balance.md)는
  초기화·지급을 호출하지 않는다. 게임 예약·정산·미니게임 보상은 별도 범위다.
- 현재 브랜치 이름에 Jira 133이 있지만 실제 이슈 유형·상위 Epic은 Jira 접근 없이 확정하지 않는다.

## DB 스키마

기본 Flyway의 `V4__create_wallets.sql`이 아래 두 테이블을 생성한다. V1~V3는 변경하지 않는다.

| 테이블 | 필드 |
| --- | --- |
| wallets | id BIGINT AUTO_INCREMENT PK, user_id BIGINT UNIQUE/FK, balance BIGINT, reserved_balance BIGINT, updated_at TIMESTAMP(3) |
| wallet_transactions | id BIGINT AUTO_INCREMENT PK, wallet_id BIGINT FK, game_session_id/minigame_session_id/item_id BIGINT NULL, transaction_type VARCHAR(32), balance_delta/reserved_delta BIGINT, idempotency_key VARCHAR(120) UNIQUE, created_at TIMESTAMP(3) |

- Wallet → users, 원장 → Wallet은 NO ACTION FK로 부모 행 삭제를 거절한다. cascade는 도입하지 않는다.
- CHECK: balance >= 0, reserved_balance >= 0, reserved_balance <= balance.
- 원장 조회용 인덱스: (wallet_id, id). 원장 키는 ascii_bin으로 대소문자를 구분한다.
- transaction_type은 기존 String 매핑을 유지한다. 현재 SIGNUP_BONUS와 기존 SHOP_PURCHASE를 생성한다.
- 아직 없는 Game/Minigame 및 선택적 items 테이블에는 FK를 추가하지 않는다.
- 시각은 Instant/UTC, 밀리초 정밀도다. JPA ddl-auto=validate를 유지한다.
- MySQL DDL은 암묵 커밋될 수 있다. V4를 적용할 때 실패한 DDL을 재실행/repair로 덮지 말고 실제 스키마와 이력을 점검한다.

## Entity·Repository와 트랜잭션

`OntopApplication`이 User/RefreshToken과 함께 wallet.domain을 등록한다. Shop이 꺼진 db/dev,db/local,db에서도
Wallet/WalletTransaction을 사용하며, db가 없는 기본/local/dev 실행에는 DataSource/JPA/Wallet 서비스가 없다.
ShopConfiguration은 선택적 상품·보유·영수증 Entity만 추가한다.

- WalletRepository: 회원 ID 조회, 향후 쓰기용 PESSIMISTIC_WRITE 조회, 관리 명령의 활성 회원 ID 페이지 조회.
- WalletTransactionRepository: 저장과 최초 지급 키 존재 검사.
- WalletInitializationService.initializeActiveMember: 회원 행 잠금 → 비활성 제외 → 기존 Wallet 보존 →
  지급 키/관련 참조 검사 → Wallet과 SIGNUP_BONUS 원장 저장.
- 회원 행 잠금으로 동일 회원의 동시 초기화를 직렬화한다. user_id UNIQUE와 원장 키 UNIQUE가 최종 방어다.
- UserOnboardingPersistenceService.create의 기존 트랜잭션에 REQUIRED로 참여한다.
  User/Wallet/원장/Refresh 중 하나라도 실패하면 모두 롤백한다. 커밋 후에만 201과 인증 쿠키를 공개한다.
- 닉네임 충돌에만 토큰 재시도를 허용하는 기존 USER-05 정책을 유지한다. 저장 실패·커밋 불명은 새 OAuth가 필요하다.

## 기존 회원 관리 명령

일반 서버 시작에서 전 회원을 순회하지 않는다. 운영자가 대상 DB와 스키마를 확인한 후 아래 명령을 별도로 실행한다.
이 구현 작업에서는 실제 ontop_dev와 기존 테스트 DB에 이 명령을 실행하지 않았다.

```powershell
cd backend
# Java 21과 DB_URL/DB_USERNAME/DB_PASSWORD를 프로세스 환경에 안전하게 주입한 뒤 실행한다.
.\gradlew.bat initializeWallets --console=plain
```

관리용 Main은 HTTP 서버 없이 db 프로필로 실행하고 완료 시 컨텍스트를 닫는다. DB 환경변수에는 대상 DB만 지정한다.
명령은 Flyway/JPA 검증도 실행하므로 **이미 V99~V101 fixture가 적용된 기존 테스트 DB에는 실행하지 않는다.**

1. 지갑에 연결되지 않은 고아 원장이 있으면 지급을 시작하지 않고 관리 검토 오류로 중단한다.
2. 활성 회원 ID를 100명씩 읽고 회원마다 별도 트랜잭션을 커밋한다.
3. 지갑이 없고 활성인 회원만 100코인 지갑+최초 원장 1건을 생성한다.
4. 기존 지갑은 지급 원장이 없어도 balance/reserved_balance/원장을 전혀 바꾸지 않는다.
5. 탈퇴 회원은 제외하고, 조회 후 탈퇴가 경합하면 회원 잠금 뒤 다시 판정한다.
6. 지갑이 없는데 지급 키 또는 Shop 보유/영수증 등 관련 데이터가 있으면
   `WALLET_INITIALIZATION_REVIEW_REQUIRED`로 중단한다. 실제 users FK와 알려진 선택적 user_id 컬럼을 검사한다.
7. 중간 중단 시 앞서 커밋된 회원은 유지된다. 원인 조사 후 재실행하면 기존 지갑은 건너뛰므로 중복 지급하지 않는다.
8. 일반 로그에는 생성/보존/처리 중 비활성 전환 건수만 출력한다. 처음부터 탈퇴한 회원은 후보에서 제외한다.
   비밀번호·소셜 식별자·인증 토큰을 출력하지 않는다.

이 명령은 임의의 과거 데이터를 재구성하는 복구 도구가 아니다. FK도 알려진 user_id도 없는 외부/레거시 참조는
자동 추론할 수 없으므로 실행 전 담당자가 확인해야 한다. 여러 관리 프로세스의 동시 실행은 불필요하지만,
동일 회원에 대한 초기화는 같은 행 잠금과 UNIQUE로 보호한다.

## 기존 DB·fixture 보존과 배포

- 기본 V4는 공통 Wallet 스키마만 생성하고 기존 회원 지급을 자동 실행하지 않는다.
- V99/V101은 과거 테스트 이력 보존용으로 파일을 그대로 남긴다. 신규 테스트/시연의 Flyway 위치에서 제외한다.
- 신규 Shop 검증 위치는 `classpath:db/migration,classpath:db/shop`이다. V4 뒤 V100으로 상품/보유/영수증을 만든다.
- 이미 V99~V101을 적용한 DB는 보존하고 신규 검증 DB를 사용한다. clean/이력 삭제/repair/out-of-order 활성화로 우회하지 않는다.
- 이미 wallets가 있는 별도 레거시 DB에 V4를 무작정 실행하지 않는다. 기존 DDL/FK/데이터와 이력 편입 절차를 별도로 검토한다.
- 권장 배포 순서: 대상 스키마 확인 → V4 적용/JPA validate → 기존 회원 명령 검토·실행 → 결과 확인.
  Shop 활성화 전에 지갑이 준비되어 있는지 확인한다. 지갑이 없으면 기존 WALLET_NOT_READY 정책이다.

## 탈퇴·복구와 Shop·Game 경계

- 회원 탈퇴는 deleted_at과 인증 폐기를 처리하고 지갑·예약액·원장을 보존한다.
- 7일 이내 복구는 같은 userId와 기존 Wallet을 유지하며 새 보너스를 지급하지 않는다.
- 탈퇴 전에 지갑이 없던 회원을 복구해도 로그인에서 자동 지급하지 않는다. 필요 시 관리 명령 대상이다.
- 7일 초과 AUTH_REJOIN_PENDING 정책, Refresh/JWT/WebSocket 4403 처리를 변경하지 않는다.
- ShopService/ShopRepository의 차감·사용 가능 잔액 검증·잠금·원장·영수증 트랜잭션은 변경하지 않았다.
- 향후 구매/예약/정산은 같은 Wallet 행을 잠그고 잔액과 원장을 같은 트랜잭션에 저장해야 한다.
  공통 Wallet 호출을 별도 REQUIRES_NEW로 분리해 구매·참가 기록과 부분 커밋하지 않는다.
- 다중 회원 잠금 순서·경기별 멱등 키·예약 해제·지급 규칙은 게임 담당자와 후속 합의한다.

## 관련 검증

Wallet 단위 테스트, 신규/기존 회원 초기화·동시성·제약·프로필 MySQL 테스트,
USER-05의 Wallet/원장/JWT/Refresh 실패 롤백 테스트와 기존 Shop 구매 테스트를 선택 실행한다.
DB 통합 테스트는 TEST_DB_* / TEST_SHOP_DB_*의 loopback 전용 격리 DB만 허용한다.
전체 회귀는 Wallet 도메인 MR 직전에 별도로 1회 실행한다.

### 2026-10-23 관련 검증 결과

- Java 21, 실제 MySQL 8.4.11. Docker 컨테이너/볼륨은 재사용하고 새 DB 2개만 준비했다.
- `ontop_users80_test_wallet133_20261023_103223_17aab2`
- `ontop_shop_test_wallet133_20261023_103223_17aab2`
- 관련 단위/HTTP/OpenAPI 90개 통과, 실패/건너뜀 0개.
- 관련 MySQL 82개 중 최초 78개 통과. CHECK 위반의 JDBC 분류 차이 3개와 원장 실패 트리거 권한 1개를
  테스트 코드에서 보완하고 해당 4개를 재실행해 모두 통과했다. 실패를 비활성화하거나 제외하지 않았다.
- CHECK는 MySQL 오류 3819로 검증한다. Shop 원장 장애는 새 격리 DB에 임시 CHECK를 추가/해제해 주입하며
  SUPER 권한 부여나 기존 서버 전역 설정 변경 없이 실제 롤백을 확인한다.
- 기본/local/dev DB 없는 실행과 db/local,db/dev,db의 Wallet 등록·JPA validate를 모두 확인했다.
- 새 격리 DB에서 관리 명령 실행: 첫 실행 created=6/preserved=24, 재실행 created=0/preserved=30.
- ontop_dev의 테이블/회원/Refresh/이력과 기존 상점 테스트 DB의 행수/이력이 조사 전후 동일했다.
  이 DB들에는 V4나 관리 명령을 적용하지 않았다. 새 검증 DB와 계정은 삭제하지 않았다.

환경변수는 안전하게 주입한 후 backend에서 다음 관련 테스트를 선택 실행했다.

```powershell
.\gradlew.bat test --tests '*WalletInitializationServiceTests' --tests '*UserOnboardingControllerTests' --tests '*OnboardingTokenStoreTests' --tests '*ShopHttpTests' --tests '*AuthDatabaseProfileTests' --tests '*OpenApiLocalTests' --console=plain
.\gradlew.bat mysqlTest --tests '*Wallet*MySqlTests' --tests '*UserOnboardingMySqlTests' --tests '*ShopMySqlTests' --tests '*UsersMySqlTests' --tests '*UserWithdrawalReferencesMySqlTests' --tests '*AuthExchangeMySqlTests.현재_V4*' --tests '*AuthRefreshMySqlTests.V4*' --tests '*AuthLogoutMySqlTests.탈퇴*' --console=plain
# 실패했던 4개만 수정 후 재검증
.\gradlew.bat mysqlTest --tests '*WalletMySqlTests.잔액과*' --tests '*ShopMySqlTests.원장쓰기*' --console=plain
git diff --check
```

기존 OpenAPI의 온보딩/Shop 설명만 실제 local HTTP 명세로 다시 생성했다. 새 Wallet REST 경로는 추가하지 않았다.

## 변경 파일 목록

- `README.md`
- `backend/build.gradle`
- `backend/src/main/java/com/ssafy/ontop/OntopApplication.java`
- `backend/src/main/java/com/ssafy/ontop/api/OpenApiSchemaCustomizer.java`
- `backend/src/main/java/com/ssafy/ontop/shop/ShopConfiguration.java`
- `backend/src/main/java/com/ssafy/ontop/user/controller/UserOnboardingController.java`
- `backend/src/main/java/com/ssafy/ontop/user/service/UserOnboardingPersistenceService.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/admin/WalletInitializationCommand.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/domain/Wallet.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/domain/WalletTransaction.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/repository/WalletInitializationGuard.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/repository/WalletRepository.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/repository/WalletTransactionRepository.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/service/ExistingWalletInitializationService.java`
- `backend/src/main/java/com/ssafy/ontop/wallet/service/WalletInitializationService.java`
- `backend/src/main/resources/db/migration/README.md`
- `backend/src/main/resources/db/migration/V4__create_wallets.sql`
- `backend/src/test/java/com/ssafy/ontop/auth/service/AuthExchangeMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/auth/service/AuthLogoutMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/auth/service/AuthRefreshMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/demo/ShopDemoApplication.java`
- `backend/src/test/java/com/ssafy/ontop/shop/ShopMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/table/WorldAppearanceMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/user/UsersMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/user/controller/UserOnboardingControllerTests.java`
- `backend/src/test/java/com/ssafy/ontop/user/service/UserOnboardingMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/user/service/UserWithdrawalReferencesMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/WalletMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/WalletPersistenceProfilesMySqlTests.java`
- `backend/src/test/java/com/ssafy/ontop/wallet/service/WalletInitializationServiceTests.java`
- `docs/api/README.md`
- `docs/api/openapi.yaml`
- `docs/shop-inventory.md`
- `docs/user-onboarding.md`
- `docs/user-withdrawal.md`
- `docs/wallet-initialization.md`
