# 공유 의상 뽑기·마이룸 상자·총자산 랭킹

2026-11-06 사용자 확정 계약. 모델링·실제 상품 매핑·공용 DB 적용·배포 완료와 구분한다.

## 이용 흐름과 규칙

뽑기방(`layout-shop`)에서 100냥으로 뽑기권 한 장 구매 → 뽑기권 사용 → 의상 상자 보관 → 마이룸 상자 보관함에서 개봉.
주간 응모권(`/api/v1/raffles`)과 별개이며, 실제 엽전 차감·지급은 서버에서만 확정한다.

| 결과 | 회차 초기 칸 수 | 상품 평가 가치 | 동일 상품 중복 지급 |
| --- | ---: | ---: | ---: |
| 1등 상자 | 1 | 1000 | 500 |
| 2등 상자 | 2 | 500 | 250 |
| 3등 상자 | 4 | 250 | 125 |
| 4등 상자 | 8 | 100 | 50 |
| 엽전 | 15 | 20냥 즉시 지급 | 해당 없음 |

남은 칸에서 균등 추첨한다. 1등 당첨은 해당 회차를 종료하고 미당첨 칸을 이월하지 않은 새 30칸을 만든다.
뽑기권·획득 상자·의상·엽전은 유지한다. 같은 DB를 사용하는 전체 채널이 하나의 기계를 공유한다.
개발·운영은 각 환경의 별도 DB/schema를 사용해야 하며 두 환경을 같은 가챠 데이터에 연결하지 않는다.

상자는 등급만 고정한다. 개봉 시 활성 상품 중 현재 서버 회원의 캐릭터 성별과 호환되는 상품을 균등 추첨하며 보유 상품도 포함한다.
ANY/MALE/FEMALE 호환성과 상품 구성은 서버 데이터다. 한 등급의 상품 개수는 기계의 등급 칸 수를 바꾸지 않는다.
통합 의상도 상품 하나로 평가한다. 구성 아이템을 전부 보유했다면 동일 상품 중복이고, 일부만 보유했다면 없는 구성만 채워 신규 상품을 완성한다.
신규 상품은 자동 장착하지 않는다. 머리·얼굴·옷을 따로 입고 섞을 수 있으며 통합 상품 일부를 교체하면 통합 상품을 함께 해제한다.
상자 교환·선물·거래·판매·천장·일괄 개봉은 제공하지 않는다.

## REST 계약

모든 경로는 활성 회원 Access JWT와 기존 REST Origin 정책을 사용하며 응답은 `Cache-Control: no-store`다.

| 메서드 | 경로 | 요청 |
| --- | --- | --- |
| GET | `/api/v1/gacha` | 없음 |
| POST | `/api/v1/gacha/tickets` | `{"operationId":"buy-1"}` |
| POST | `/api/v1/gacha/draws` | `{"operationId":"draw-1","roundId":"1"}` |
| POST | `/api/v1/gacha/boxes/open` | `{"operationId":"open-1","grade":1}` |
| GET | `/api/v1/gacha/operations/{operationId}` | 본인 확정 결과만 복구 |

작업 ID는 영문·숫자·밑줄·하이픈 1~64자다. 새 작업에 새 ID를 사용하고 응답 유실·인증 갱신·전송 제한 재시도는 원래 ID와 본문을 유지한다.
같은 회원·ID에서 종류 또는 대상이 다르면409 `IDEMPOTENCY_CONFLICT`다. 요청에 없는 항목이나 문자열형 등급·사용자 ID·클라이언트 지급액은 받지 않는다.

조회 응답 예시(문서용 예시이며 실제 계정 조회 결과가 아님):

```json
{
  "enabled": true,
  "ticketPrice": 100,
  "machine": {
    "roundId": "1", "version": 0, "remaining": 30,
    "prizes": [
      {"grade":1,"initial":1,"remaining":1,"value":1000},
      {"grade":2,"initial":2,"remaining":2,"value":500},
      {"grade":3,"initial":4,"remaining":4,"value":250},
      {"grade":4,"initial":8,"remaining":8,"value":100},
      {"grade":5,"initial":15,"remaining":15,"value":20}
    ]
  },
  "inventory": {"tickets":1,"boxes":[{"grade":1,"quantity":0},{"grade":2,"quantity":0},{"grade":3,"quantity":0},{"grade":4,"quantity":0}],"balance":900,"availableBalance":900},
  "products": []
}
```

확정 응답은 `operationId,kind,roundId,grade,product,duplicate,paidCoins,awardedCoins,inventory,completedAt`다.
kind는 BUY/DRAW/OPEN, 구매의 grade는0, 엽전 당첨은5다. 구매·개봉의 roundId는 null이며 뽑기는 당첨 당시의 회차를 반환한다.
product는 의상 개봉에서만 존재한다(`code,name,grade,compatibility,imageKey,itemIds`). 의상 상자 획득 시에는 null이다.
inventory는 확정 당시 재고이므로 오래된 영수증 복구 후에는 GET으로 최신 재고·지갑을 다시 확인한다.

| 상태 | 코드 | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | 요청 형식 오류 |
| 401 | UNAUTHENTICATED | 활성 회원 인증 필요 |
| 404 | GACHA_RESULT_NOT_FOUND | 본인의 확정 결과 없음 |
| 409 | INSUFFICIENT_BALANCE / WALLET_NOT_READY | 사용 가능 잔액 부족 또는 지갑 준비 필요 |
| 409 | GACHA_NO_TICKET / GACHA_NO_BOX | 소비 가능한 재고 없음 |
| 409 | GACHA_ROUND_CHANGED | 본 회차가 바뀌었으며 뽑기권 미소비. 새 상태 확인 후 새 작업으로 요청 |
| 409 | GACHA_NO_COMPATIBLE_PRODUCT | 호환 상품 없음. 상자 미소비 |
| 409 | IDEMPOTENCY_CONFLICT | 같은 작업 ID의 본문 충돌 |
| 503 | GACHA_NOT_CONFIGURED | 기능 미활성 또는 DB 서비스 미등록 |
| 503 | GACHA_CATALOG_NOT_READY / GACHA_CATALOG_INVALID | 실제 상품 매핑 불완전. 구매 미차감 |
| 503 | GACHA_UNAVAILABLE | DB 일시 오류. 같은 작업으로 복구 |

인증·403·429·타임아웃은 이전 거래 미확정의 증거가 아니다. 클라이언트는 복구 키를 보존한다.

## 공개 WS 상태와 공지

전체 채널의 맵 입장 완료 소켓에 `GACHA_STATE`를 보낸다. payload는 `eventId,machine,winner,confirmedAt`다.
일반 추첨의 winner는 null, 1등은 `{"userId":"101","nickname":"테스트","winningRoundId":"1"}` 형식이다.
1등 이벤트의 machine은 이미 초기화된 새 회차다. 본인 재고·지갑·개봉 상품은 방송하지 않는다.
클라이언트는 machine.version 역행과 같은 eventId 재표시를 막고, 기존 관리자 공지를 덮지 않는 공지 영역에 당첨을 표시한다.
재접속은 REST 현재 상태를 복구하며 과거 공지 내역을 조회 응답에 재생하지 않는다.

기계 상태·이벤트를 같은 트랜잭션에 저장한다. 노드별 전달 커서는 성공한 방송 뒤에만 전진하고 실패 시 재시도한다.
`GACHA_NODE_ID`는 단일 노드 기본 server-1이며 **다중 노드는 각자 다른, 재시작 후에도 유지되는 ID**를 설정해야 한다.
단순 WS는 연결 종료 중 수신을 보장하지 못하며, 재전송은 클라이언트의 이벤트 ID 중복 방지와 결합한다.

## 총자산과 장착

`GET /api/v1/rankings`, `GET /api/v1/rankings/park`의 엽전 순위를 총자산 순으로 확장한다.
`coinBalance`는 실제 잔액을 유지하고 `equipmentValue`, `totalAssets`를 추가한다.
총자산은 엽전 + 구성 아이템을 전부 보유한 상품의 등급 가치 합계다. 과거 보유도 포함하고 상품당 한 번만 평가한다.
상품 활성 여부·현재 캐릭터·착용 여부·보유 수량과 무관하게 등록 상품을 평가한다. 기본/미등록 아이템·뽑기권·미개봉 상자는 제외한다.
기능 미활성은 기존 잔액 기준을 유지한다. 공원판은 기존60초 집계·updatedAt을 유지한다.

가챠 등록 상품은 보유 응답의 setCode를 `gacha:상품코드`로 매핑해 실제 통합 단위로 입고 벗는다.
collection_code는 수집 디자인 분류용이며 장착 묶음으로 사용하지 않는다. 등록되지 않은 기존 의상 장착 계약은 유지한다.

## V156 DB 스키마 변경과 기존 데이터 영향

`V156__create_shared_gacha.sql`은 아래 **7개 테이블을 새로 생성**한다. 기존 테이블의 컬럼 추가·삭제·변경, 기존 데이터 수정은 없다.

| 새 테이블 | 저장하는 내용 | 주요 식별자·제약 |
| --- | --- | --- |
| `gacha_machine` | 환경 전체가 공유하는 현재 회차·상태 버전·등급별 남은 칸 | PK `id=1`인 한 행. 최초 회차1·버전0·수량1/2/4/8/15로 생성 |
| `gacha_inventory` | 회원별 뽑기권과 1~4등 상자 수량 | PK/FK `user_id → users.id`, 재고 음수 금지 |
| `gacha_products` | 논리 의상 상품 코드·이름·등급·호환 캐릭터·이미지·수집 디자인·활성 여부 | PK `product_code`, 등급1~4·호환ANY/MALE/FEMALE 제한. 기본 비활성 |
| `gacha_product_items` | 상품 하나에 포함되는 기존 물리 아이템 ID | PK `(product_code,item_id)`, `item_id` 중복 소속 금지, 상품 FK |
| `gacha_receipts` | 구매·추첨·개봉 작업의 종류·대상·최초 확정 응답 JSON·시각 | PK `(user_id,operation_id)`, 회원 FK. 같은 작업 재시도에 기존 결과 반환 |
| `gacha_events` | 커밋과 함께 저장하는 공개 기계 상태·1등 공지 | 증가 PK `id`, 고유 `event_id`, JSON payload·시각 |
| `gacha_delivery_cursors` | 서버 노드가 어디까지 이벤트를 전달했는지 | PK `node_id`, 마지막 처리 이벤트 ID. 재시작 후 미전달분 재시도 |

기존 `wallets`와 `wallet_transactions`는 기존 구조 그대로 차감·지급·원장 기록에 사용한다. 새 거래 유형 `GACHA_PURCHASE`/`GACHA_PAYOUT`은 기존 문자열 컬럼의 값이며 새 컬럼이 아니다. 획득 의상은 기존 `items`와 `user_items`를 사용한다. 티켓과 미개봉 상자는 `user_items`에 섞지 않는다.

`equipmentValue`·`totalAssets`는 **새 DB 컬럼이 아니라 조회 계산 결과와 API 응답 필드**다. 기존 보유품을 일괄 수정하지 않고, 등록 상품의 구성 아이템을 전부 보유했는지 조회해 상품 가치를 한 번만 합산한다.

선택 적용되는 상점 스키마가 없는 서버도 V156 자체는 적용할 수 있도록 `gacha_product_items.item_id`에는 `items` FK를 걸지 않는다. 기능을 켜기 전 실제 `items` 대응표가 필요하며, 구매·개봉에서 아이템 존재/종류/부위 구성을 서버가 검증한다. 마이그레이션에는 실제 상품·의상 지급·기존 재고 변환·테스트 회원 데이터가 들어 있지 않다.

현재 적용 범위는 공용 DB와 분리한 loopback 검증 DB뿐이다. 개발·운영 DB 적용과 배포는 아직 수행하지 않았다. 공용 적용 시에는 기존 Flyway 성공 이력·팀 공유한 V156 순서 확인 → 기존 상점 스키마 확인 → V156 정상 적용 확인 → 실제 상품 매핑 등록 → 모델·진입점 검수 → 명시적 기능 활성화 순서로 진행한다. 기존 SQL 수정·repair·outOfOrder·DB 초기화는 사용하지 않는다.

## 등록·배포

V156은 새로운 가챠 테이블만 추가한다. 선택적 db/shop 테이블에 FK를 걸지 않아 SHOP 미활성 서버의 기본 마이그레이션을 막지 않는다.
실제 아이템·소유 지급은 기존 items/user_items를 재사용하므로 활성화에는 상점 스키마와 SHOP_ENABLED=true가 필요하다.
GACHA_ENABLED 기본 false. 실제 상품코드·등급·성별·이미지·구성 아이템 대응표를 받아 등록·검수한 다음 활성화한다.
구매는 모든 등급에 해당 캐릭터용 유효 상품이 있는지 검사하므로 대응표 없이 결제되지 않는다.
상품별 구성 아이템은 중복 슬롯이 없어야 하고, 옷을 포함하면 TOP/BOTTOM/SHOES 세 아이템을 모두 포함해야 한다.
같은 내부 아이템을 여러 상품에 등록할 수 없다. 상품 등록·가격 변경은 관리자 화면 API로 제공하지 않는다.

Flyway 번호는 사용자 지정 V156이다. 팀 공유·기존 최종 적용 버전 이후의 순서는 푸시·공용 DB 적용 전에 확인한다.
기존 적용 SQL·Flyway 이력은 바꾸지 않는다. 롤백은 기능을 끄고 재고·영수증·이벤트를 보존한다.
유료 뽑기 당첨·중복 환급은 무료 미니게임의 하루500냥 보상 상한에 합산하지 않는다.
