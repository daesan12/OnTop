# 상점·인벤토리 API

2026-10-22 사용자 승인: SHOP-01/02·INVENTORY-01/02 구현. [현행 API](https://app.notion.com/p/API-062161842b868239a9ef81452674b90c), [OnTop ERD](https://www.erdcloud.com/d/fb3woEfx3FLMCny9H)의 items/user_items/wallets/wallet_transactions 컬럼을 대조했다. 비어 있던 상세 요청·응답을 아래 현재 코드 계약으로 채운다. 실제 판매 상품·가격을 예제 값으로 확정하지 않는다.

## 공통

- local 프로필. 4개 API 모두 Access JWT·활성 계정 필수. 인증은 ShopAccessFilter→기존 AccessJwtService/계정 조회다. userId·접속권·세션 값으로 우회하지 않는다.
- JSON 응답, Cache-Control: no-store. 허용된 AUTH_ALLOWED_ORIGINS만 CORS, OPTIONS는 인증 없이204. 요청은 GET/POST/PATCH, Authorization/Content-Type/Idempotency-Key만 프리플라이트 허용.
- 숫자 ID는 양의 정수, 수량도 양의 int. 금액·소유자·장착 부위 추가 입력, 문자열 숫자·소수·잘못된 JSON은400 INVALID_REQUEST.
- 기본값은 비활성: local,db + ontop.shop.enabled=true와 아래 스키마가 필요하다. 미설정503 SHOP_NOT_CONFIGURED, DB 장애503 SHOP_UNAVAILABLE. 빈 목록/구매 성공으로 위장하지 않는다.

## SHOP-01 · GET /api/v1/shop/items

요청 본문 없음. 응답 `{items:[{itemId,itemCode,name,itemType,equipSlot,price,imageKey}]}`. 판매 중인 상품만 itemId 순서다. itemType=EQUIPMENT/CONSUMABLE, equipSlot=HAIR/FACE/TOP/BOTTOM/SHOES 또는 null. price는 서버 DB 가격이다.

## SHOP-02 · POST /api/v1/shop/purchases

Idempotency-Key 헤더 필수, 영문·숫자·하이픈·밑줄1~64자. 요청마다 새 키를 생성하고 같은 구매 재확인 때만 재사용한다.

```json
{"itemId":1,"quantity":1}
```

HTTP200 응답 형식. 예제는 검증용 상품·잔액이며 실제 사용자 데이터가 아니다.

```json
{
  "purchaseId": "example-purchase-uuid",
  "itemId": 1,
  "quantity": 1,
  "unitPrice": 10,
  "totalPrice": 10,
  "balanceAfter": 90,
  "userItemId": 1
}
```

JPA EntityManager·JPQL 저장소를 사용한다. 지갑 PESSIMISTIC_WRITE(MySQL FOR UPDATE) → 기존 영수증 확인 → 판매 상품/가격 읽기 → balance-reserved_balance 잔액 검사 → 차감·보유 지급·SHOP_PURCHASE 원장·영수증을 같은 JpaTransactionManager 트랜잭션으로 저장한다. 지갑·보유 수량·장착은 관리 엔티티 변경 감지, 원장·영수증은 persist/flush로 저장한다. 상점 제품 코드에는 JdbcTemplate·네이티브 SQL을 사용하지 않는다. 검증 데이터 준비·독립 SQL 확인은 테스트에서만 JDBC를 사용한다. 원장/영수증 저장 실패에도 차감·지급이 전부 롤백된다. 판매 상태·가격이 바뀌어도 같은 키·같은 요청은 최초 영수증을 반환한다. balanceAfter는 해당 구매 당시 전체 잔액이며 이후 현재 잔액으로 바꾸지 않는다. 예약 금액은 쓰거나 변경하지 않는다.

같은 사용자·같은 키의 다른 itemId/quantity는409 IDEMPOTENCY_CONFLICT다. 계정별 키 범위는 독립이고 대소문자를 구분한다. 공통 원장 키는 shop:사용자:SHA256(키)로 만들어 원장 문자열 collation의 대소문자 병합을 피한다. 영수증 UNIQUE(user_id,request_key)는 ascii_bin이다.

404 ITEM_NOT_FOUND,409 INSUFFICIENT_BALANCE/WALLET_NOT_READY/ITEM_ALREADY_OWNED,400 QUANTITY_TOO_LARGE. **2026-10-22 사용자 확정: 보유 의상은 중복 구매 거절(REJECT).** 의상은 수량1만 구매 가능하며 기보유 재구매/다른 수량은 차감·원장·보유 변경 전에409 ITEM_ALREADY_OWNED다. 같은 구매 키·같은 본문 재요청은 이전 영수증을 반환하므로 중복 구매로 거절하지 않는다. 소비형은 수량을 누적한다. 정식 ShopConfiguration에서 REJECT로 고정하며 별도 duplicate-equipment-policy 설정은 필요하지 않다. 내부 STACK/미지정 방어 분기는 정식 서버 설정으로 활성화하지 않는다. 기존 보유 수량을 자동 정리하거나 DB를 변경하지 않는다.

## INVENTORY-01 · GET /api/v1/users/me/items

요청 본문 없음. 응답 `{items:[{userItemId,item:{상품 필드},quantity,equipped}]}`. 인증된 본인 quantity>0만 userItemId 순서다. 판매 종료된 보유도 표시하며 타인의 userId를 입력받지 않는다. item.price는 현재 가격이고 과거 구매가는 영수증 unitPrice다.

## INVENTORY-02 · PATCH /api/v1/users/me/equipment

```json
{"userItemId":1}
```

본인 소유·EQUIPMENT·유효 장착 부위를 검사하고 같은 부위의 기존 의상을 해제한 뒤 선택 의상을 장착한다. 응답 `{equipment:[{userItemId,item:{상품 필드},quantity,equipped:true}]}`는 전체 장착 목록이다. 타인/없는 보유404 OWNED_ITEM_NOT_FOUND, 소비형409 ITEM_NOT_EQUIPPABLE. 동시 장착도 같은 지갑 행으로 직렬화해 같은 부위 하나만 유지한다. 동일 의상 재장착은 추가 차감하지 않는다.

커밋 뒤 내부 EquipmentChanged(userId)를 발행하며 외부 트랜잭션이 롤백되면 알리지 않는다. 알림 리스너 실패를 이미 저장된 장착 실패로 응답하지 않는다. ShopWorldAppearanceGateway가 TableHub의 비동기 갱신을 요청하고, 별도 읽기 전용 READ_COMMITTED 트랜잭션으로 최신 장착을 조회한다. Hub 잠금 밖에서 조회한 뒤 같은 연결·채널·최신 요청인지 확인해 캐시에 반영하고 같은 채널의 본인·다른 참가자에게 WORLD_STATE를 전송한다. 최초·반복 CHANNEL_JOIN 및 재접속 후 CHANNEL_JOIN도 최신 상태를 조회한다. 이동 tick마다 DB를 조회하지 않으며 조회 실패는 기존 캐시를 유지한다.

공개 필드는 `WORLD_STATE.payload.avatars[].equipment`이며 itemId·itemCode·equipSlot·imageKey만 최대5개 전달한다. null은 아직 조회되지 않았거나 기능 비활성/조회 실패인 상태이므로 기존 외형을 지우지 않는다. []는 조회 성공·장착 없음이다. 가격·보유 ID·수량은 공개하지 않는다. 기존 REST 응답은 그대로다. [메시지 계약](world-websocket-api.md#의상-변경-동기화)을 참고한다. 실제 3D 에셋 매핑·프론트 렌더링 연동은 별도 협의이며 신규 WS 요청/의상 해제·소비 API는 추가하지 않았다.

## DB 연결 경계

선택적 `backend/src/main/resources/db/shop/V100__create_shop_inventory.sql`은 items/user_items/shop_purchases만 만든다. 현재 기본 Flyway 위치 db/migration에는 포함하지 않았다. 이미 팀 스키마가 있는 DB에 중복 적용하지 말고 최종 DDL과 대조 후 해당 위치를 통합한다. 사용자·지갑·경기·공통 원장은 재정의하지 않는다.

2026-10-22 사용자 확정: 구매·판돈·정산 등 재화 변경은 같은 지갑 행을 잠그고 순서대로 처리한다. 구매의 FOR UPDATE는 이미 구현됐으며 실제 공통 서비스 전체의 적용 완료를 뜻하지 않는다.

공통 지갑 담당과 확인할 조건: wallets.user_id UNIQUE·id 자동 생성, balance는 전체 잔액이고 reserved_balance는 그 일부, 원장 id 자동 생성·idempotency_key UNIQUE·item_id/SHOP_PURCHASE 지원, 모두 같은 MySQL DataSource/InnoDB. 다른 재화 변경도 같은 지갑 행 잠금을 사용해야 한다. V100의 AUTO_INCREMENT·UNIQUE·CHECK·FK와 영수증 테이블은 ERD 미리보기에 없는 실행 제약 보완이며 ERD 원본은 수정하지 않았다.

테스트 전용 db/shop-fixture/V99는 공통 지갑/원장을 최소 구성한 경계 fixture다. 제품의 지갑 초기화·게임 정산 구현이 아니고 운영/개발 DB에 적용하지 않는다. 검증은 TEST_SHOP_DB_URL=loopback/ontop_shop_test_*만 허용한다.

## 실행·검증 화면

Java21 Wrapper mysqlTest --tests '*ShopMySqlTests': 별도 MySQL8.4에서 실제 JWT/HTTP/SQL·중복8요청·동시 잔액·롤백·예약금·장착·커밋 후 알림을 검사한다. ShopHttpTests는 인증·불허 출처·잘못된 본문/키를 검사한다. 기존 users/auth MySQL suite와 다른 DB를 사용한다.

WorldAppearanceMySqlTests는 장착·광장·테이블을 연결해 확인한다. 실제 JWT/접속권·HTTP 장착·Raw WebSocket으로 이동 입력 수락→착석/전원 준비→착석 중 의상 교체(테이블 상태 유지)→heartbeat 단절→새 티켓/채널 입장·최신 의상 복구→재착석·재준비를 검증한다. 대기 좌석은 단절 시 정리되며 외형 복구가 자동 착석/준비를 뜻하지 않는다. 물리는 시간 고정 fixture이며 경기 DB 차감·정산·실제3D 렌더링 검증과 구분한다. 실행·확인 범위는 [통합 검사](flow-test.md#실제-db-의상테이블-통합-검증)를 따른다.

테스트 클래스패스의 shopDemo는 loopback 전용 ontop_shop_test_demo* DB만 허용하고 http://127.0.0.1:18083/dev/shop 화면을 제공한다. 100엽전·3개 상품·시연 계정만 초기화하며 실제 REST를 호출한다. 운영 JAR에 화면·테스트 계정·우회 인증을 포함하지 않는다. 의상 REJECT는 시연 조건이다. DB_URL/DB_USERNAME/DB_PASSWORD와 검증용 AUTH_JWT_SECRET_BASE64가 필요하며 원문을 캡처/공유하지 않는다.

## 2026-10-22 JPA 전환

API 경로·요청·응답·동일 키 재요청은 그대로다. 의상 중복 정책은 위 2026-10-22 사용자 확정 REJECT를 따른다. ShopService → ShopRepository(EntityManager/JPQL) → Item/UserItem/ShopPurchase/Wallet/WalletTransaction 순서로 읽는다. SQL 마이그레이션은 계속 Flyway가 관리하고 JPA ddl-auto=validate를 유지한다.

지갑 잠금 후 refresh로 이전에 관리 중인 잔액을 갱신한다. 신규 트랜잭션은 READ_COMMITTED를 사용하고 없는 영수증·보유 행에는 gap 잠금을 걸지 않는다. 기존 보유 엔티티는 refresh로 갱신하고, 장착은 보유 엔티티 변경으로 같은 부위 하나만 남긴다. 기존 외부 트랜잭션에 참여하며 장착 알림은 실제 커밋 뒤에만 발생한다.

상점이 비활성인 DB에는 추가 테이블을 요구하지 않도록 OntopApplication은 기존 User/RefreshToken 패키지를 스캔하고, ShopConfiguration이 활성화될 때만 item.domain.Item·inventory.domain.UserItem·shop.domain.ShopPurchase·wallet.domain 패키지를 합친다. 다른 도메인 엔티티를 새로 추가할 때도 해당 패키지를 스캔 대상으로 등록해야 한다. 지갑 엔티티는 wallet.domain.Wallet 하나로 사용한다. 게임 판돈·정산을 연결할 때 기존 Wallet을 확장·재사용하고 같은 wallets 테이블에 별도 엔티티를 중복 생성하지 않는다. 현재 경기 재화 처리 통합 완료를 뜻하지 않는다.

외부 트랜잭션에 참여하면 외부 격리 수준을 그대로 따른다. 구매를 포함하는 공통 흐름은 READ_COMMITTED를 사용한다. 외부 REPEATABLE_READ 트랜잭션이 구매 전 읽기 스냅샷을 이미 만들었다면 이후 다른 트랜잭션의 새 영수증/보유 행은 보이지 않을 수 있다. 이는 기존 JDBC 일반 조회에도 있던 조건이며, 그 경우까지 자동 복구한다고 보장하지 않는다. 외부 트랜잭션 롤백의 원자성은 유지한다.

## 지갑 엔티티 이름·위치

지갑은 `com.ssafy.ontop.wallet.domain.Wallet`이며 ERD의 `wallets` 테이블 한 행에 연결된다. 상점 전용 지갑 테이블을 따로 만들지 않는다. ShopRepository의 JPQL도 `Wallet`을 사용한다. 이름·패키지만 정리하며 기존 API·컬럼·트랜잭션·예약금·멱등성·장착 커밋 알림은 유지하고 DB 마이그레이션은 추가하지 않는다. 거래 원장은 `com.ssafy.ontop.wallet.domain.WalletTransaction`이며 기존 `wallet_transactions` 테이블에 연결된다. 현재 생성 로직은 기존 SHOP_PURCHASE 기록을 유지하며, 이 이름 정리만으로 경기·미니게임 거래 처리까지 구현된 것은 아니다.

상품 엔티티는 `item/domain/Item.java` → items, 보유 엔티티는 `inventory/domain/UserItem.java` → user_items다. ShopConfiguration은 두 엔티티 패키지와 영수증·지갑 패키지를 조건부 등록한다. 구매 영수증 ShopPurchase → shop_purchases는 이미 테이블에 맞는 이름이라 유지한다. 회원·인증 엔티티와 그 서비스는 수정하지 않는다. 상품/보유 DTO의 JSON 필드와 API URL은 그대로다.

2026-10-22 경기 참조 보완: WalletTransaction에 ERD의 `game_session_id`, `minigame_session_id`를 nullable `Long`으로 매핑한다. 상점 생성자는 두 값을 NULL로 유지하며 기존 API는 바뀌지 않는다. 실제 공통 원장 DB에도 BIGINT NULL 두 컬럼이 필요하다. 공통 테이블의 운영 DDL·경기 엔티티·정산 서비스는 이 변경에서 수정하지 않는다. 테스트 경계는 새 V101로 확장해 기존 V99 체크섬을 보존한다.

## 코드 컨벤션에 따른 위치

- 엔티티: `shop/domain/ShopPurchase.java`, `item/domain/Item.java`, `inventory/domain/UserItem.java`, `wallet/domain/Wallet.java`, `wallet/domain/WalletTransaction.java`.
- 상점 설정·서비스·저장소는 `shop/config`, `shop/service`, `shop/repository`, 응답은 `shop/dto/*Response`로 분리한다. 응답 JSON 필드와 엔티티 테이블·컬럼은 유지한다.
- 인증 필터가 직접 참조하는 `shop/ShopController`와 `shop/ShopException`은 호환 위치를 유지한다. 인증·회원 코드 및 필터 구현은 수정하지 않는다.
