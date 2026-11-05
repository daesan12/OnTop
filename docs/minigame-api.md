# 붕어빵 미니게임 API · v2 / v4 Story 1·2·3

기준: 2026-10-23 수신한 `붕어빵_뒤집기_최종기획.md`, BE·FE 작업명세와 사용자 확정 사항.
이 문서는 기존 MINI-01~04 v2 계약과 명시적으로 선택하는 v4 Story 1·2·3 계약을 함께 설명한다.
기본 비활성인 v5 계약은 `docs/minigame-bungeoppang-v5-contract.md`에 따로 정리한다.
랭킹은 제외하고 탭 이동 중에도 시간은 흐른다.
가게 위치·캐릭터 배치는 미정이며 이 REST 흐름을 막지 않는다.

## 실행과 저장

- 기존 Access JWT와 활성 회원 인증을 재사용한다. 사용자 ID는 인증에서 가져오고 요청 본문에서 받지 않는다.
- `local,db` + `ontop.minigames.enabled=true`, 또는 `dev,db`에서 활성화한다. dev는 기본 활성화한다.
- `prod`/`production`을 함께 켜면 미니게임 컨트롤러·저장소·서비스·CORS 예외를 등록하지 않는다.
- Flyway locations: `classpath:db/migration,classpath:db/minigame`. 상점도 쓰면 `classpath:db/shop` 추가.
- V110 기존 공통 세션/시작 영수증 유지. V111은 붕어빵 전용 입력·불 세기·최초 결과를 보관하는
  `bungeoppang_records`, 안내 이력 `bungeoppang_profiles`와 일일 보상 조회 인덱스를 추가한다.
- V124는 v4 판별 규칙·서버 시간·checkpoint 원점과 현재 주문을 보관하는
  `bungeoppang_v4_rounds`, `bungeoppang_v4_orders`를 추가한다. 기존 V110/V111을 수정하지 않는다.
- V125는 승인된 행동 prefix와 checkpoint를 보관하는 `bungeoppang_v4_progress`, 동일 납품 요청의
  성공·거부 결론을 재생하는 `bungeoppang_v4_receipts`를 추가한다. 납품에서는 Wallet과 원장을 변경하지 않는다.
- V126은 v4 판에 최종 의미 요청 hash·최종 seq/hash·정산 시각·KST 보상 귀속일을 고정한다.
  상세 결과/제출은 기존 `bungeoppang_records`, 완료 멱등 응답은 V125 영수증을 재사용한다.
- 공통 `Wallet`, `WalletTransaction`을 사용한다. 거래 종류 `MINIGAME_REWARD`, 참조 `minigame_session_id`,
  키 `minigame-reward:{id}`를 유지하며 별도 지갑을 만들지 않는다.
- 지갑 → 세션 잠금 순서. 같은 회원의 시작/완료/포기/상점 구매가 같은 지갑 잠금을 사용한다.
  일일 합계는 이 잠금 안에서 완료 세션을 조회하므로 중복 집계 테이블 없이 상한을 지킨다.
- 응답은 `Cache-Control: no-store`. BIGINT ID는 문자열로 응답한다.

### 개발 서버 연동 설정

- 개발 프론트는 `https://dev.on-top.world`, 백엔드는 `https://dev-api.on-top.world`다.
  프론트의 기존 `/api/v1` 프록시 또는 위 백엔드 주소를 사용하고 Access JWT를 전달한다.
- 기존 `AUTH_ALLOWED_ORIGINS`에 실제 프론트 origin이 있어야 한다. 와일드카드나 운영 프론트 주소를
  임의로 추가하지 않는다. 미니게임 경로의 OPTIONS만 `Authorization, Content-Type, Idempotency-Key`를
  허용하며 실제 GET/POST 회원 인증은 기존 공통 인증을 그대로 거친다.
- `dev,db`의 Flyway는 `db/migration` + `db/minigame`을 읽는다. 기존 공통 테이블은 보존하고
  V110/V111/V124/V125/V126의 미니게임 테이블·인덱스만 추가한다. `ddl-auto=validate`와 Flyway 검증을 유지한다.
  `clean`/`repair`/`out-of-order`나 기존 스키마 초기화는 사용하지 않는다.
- 기존 공통 마이그레이션 V1~V6가 먼저 적용된 DB를 기준으로 한다. 이미 고번호 V100/V110 등을
  적용했지만 V5/V6가 없는 별도 DB는 먼저 이력을 확인해야 한다. 이 MR은 그런 DB를 임의 복구하지 않는다.
- 이미 지갑이 있는 정상 회원으로 시작·조회·완료를 연동한다. 기존 회원의 지갑 생성은 별도 관리 작업이다.
- 이 설정은 MR 병합 후 개발 이미지 재빌드·배포 때 적용된다. MR 생성/로컬 검증만으로 원격 반영을 뜻하지 않는다.

## v4 Story 1 · 규칙과 판 초기화

v4는 요청에서 `rulesVersion: "v4"`를 명시한 경우에만 사용한다. 필드를 생략하거나 `v2`를 보내면
아래의 기존 v2 계약을 그대로 사용한다. 저장된 규칙 버전으로 이후 조회·검증기를 선택하며 기존 v2 판을
v4로 다시 계산하지 않는다. v2/v4를 합쳐 회원당 활성 판은 최대 1개다.

### v4 판 시작

`POST /api/v1/minigames/sessions`

```json
{
  "minigameType": "BUNGEOPPANG",
  "rulesVersion": "v4"
}
```

기존과 같은 `Idempotency-Key`가 필요하다. 같은 회원·키·버전은 최초 응답과 난수·주문·시간 원점을
그대로 재생한다. 같은 키를 v2와 v4로 바꾸어 사용하면 `409 IDEMPOTENCY_KEY_CONFLICT`다.

성공 HTTP 201의 축약 예시:

```json
{
  "minigameSessionId": "901",
  "minigameType": "BUNGEOPPANG",
  "status": "PLAYING",
  "phase": "WAITING_START",
  "rulesVersion": "v4",
  "configVersion": "v4-20261027.1",
  "issuedAt": "2026-10-27T00:00:00Z",
  "startedAt": "2026-10-27T00:00:04.500Z",
  "timing": {
    "countdownStartsAt": "2026-10-27T00:00:01Z",
    "playStartsAt": "2026-10-27T00:00:04.500Z",
    "playEndsAt": "2026-10-27T00:01:04.500Z",
    "submitDeadline": "2026-10-27T00:01:19.500Z",
    "expiresAt": "2026-10-27T00:01:29.500Z"
  },
  "rules": {
    "slots": 6,
    "durationMs": 60000,
    "countdownMs": 3500,
    "sideMs": 8000,
    "rushSideMs": 6000,
    "rushFromMs": 40000,
    "heatMin": 85,
    "heatMax": 115,
    "heatListLength": 512,
    "trayCapacity": 4,
    "maxOrderItems": 4,
    "specialOrderChancePercent": 20,
    "specialBonusPercent": 50,
    "firstOrder": {"bean": 2, "custard": 0, "pizza": 0, "chocolate": 0},
    "okFrom": 50,
    "goldenFrom": 70,
    "goldenTo": 90,
    "burntFrom": 100,
    "okPoint": 2,
    "goldenPoint": 5,
    "pointsPerCoin": 15,
    "dailyCoinCap": 500,
    "minGapMs": 50,
    "sameSlotGapMs": 300,
    "maxLogEntries": 1200
  },
  "heats": [100, 85, 115],
  "isFirstGame": true,
  "checkpoint": {
    "revision": 0,
    "throughSeq": 0,
    "prefixHash": "<server-hash>",
    "heatCursor": 0,
    "lastAt": null,
    "slots": [],
    "tray": [],
    "stats": {"score": 0, "made": 0, "served": 0, "bonusScore": 0},
    "currentOrder": {
      "orderId": "1",
      "orderIndex": 0,
      "items": {"bean": 2, "custard": 0, "pizza": 0, "chocolate": 0}
    }
  }
}
```

예시는 `heats`, `slots`, `stats`를 줄였다. 실제 시작 응답은 서버가 저장한 85~115 정수 불 512개,
6개 빈 철판 칸, 전체 통계 필드를 반환한다. 첫 주문은 팥 2개다. 미래 주문 목록과 난수 seed는 노출하지 않는다.

서버는 발급 시각 `T0`를 고정하고 준비 1000ms, 카운트다운 3500ms, 플레이 60000ms,
제출 유예 15000ms, drain 10000ms를 적용한다. 유효 행동 상대 시각은 `0..59999`다.
재시도·탭 비활성·단절은 저장된 시각을 연장하거나 다시 시작하지 않는다.

### v4 시작 화면과 판 조회

`GET /api/v1/minigames/sessions?rulesVersion=v4`는 HTTP 200으로 다음 계약을 반환한다.

```json
{
  "rulesVersion": "v4",
  "serverNow": "2026-10-27T00:00:00.200Z",
  "todayEarned": 5,
  "dailyCap": 500,
  "isFirstGame": false,
  "seenTips": ["GOLD", "START"],
  "activeSessionId": "901",
  "supportedRulesVersions": ["v2", "v4"]
}
```

`GET /api/v1/minigames/sessions/{id}`는 DB에 저장된 버전에 따라 v2 또는 v4 응답을 반환한다.
v4의 기본 응답에는 `serverNow`, `timing`, 최신 `checkpoint`, 현재까지 발급된 주문이 포함된다.
`result`와 `deliveryLookup`은 기본적으로 `null`이다. Story 1 원본이 필요한 클라이언트는
`?includeSource=true`로 저장된 `rules`, `heats`, `issuedAt`, `isFirstGame`을 함께 조회할 수 있다.
Story 2 복구에는 `?includeProgress=true`를 사용하며 서버가 승인한 `acceptedLog`를 함께 반환한다.
`?deliveryKey=<Idempotency-Key>`를 함께 주면 해당 키의 영속 납품 결론을 `deliveryLookup`으로 조회한다.
타인 판과 없는 판은 같은 404다.

### 새로고침·재접속 시 FE 복구 (v4/v5)

- 월드 입장과 맵 확인이 끝난 뒤 본인의 `BUNGEOPPANG` 활동이 남아 있으면 기존 로비 GET의 `activeSessionId`로 같은 판을 조회한다. 새 판 시작 POST를 보내지 않는다.
- `GET /api/v1/minigames/sessions/{id}?includeSource=true&includeProgress=true` 한 번의 응답에 담긴 규칙·불세기·주문·승인 로그·checkpoint·서버 시각으로 조리 화면을 복원한다. 해당 GET의 왕복 시간을 측정해 시계를 맞추며, 진행 중 판에서 1초를 초과하면 명시적 재시도를 안내한다. 서버가 승인하지 않은 입력은 복구 대상이 아니다. 로비 GET은 별도 1회이며, 신규 시작 POST의 영수증 재확인 경로는 유지한다.
- 원래 `timing`을 사용하므로 새로고침으로 제한 시간이 늘어나지 않는다. 승인 prefix 해시가 맞지 않는 응답은 적용하지 않는다.
- 연결 실패는 복구 안내와 명시적 재시도를 표시한다. 매 월드 상태 수신마다 자동 재요청하지 않는다. 판 ID가 확인된 뒤 사용자가 포기를 선택한 경우에만 기존 abandon API를 호출한다.
- 첫 로비 조회가 실패해 판 ID가 없는 경우 `공원 화면 보기` 또는 Esc로 복구 화면을 닫을 수 있다. 이 동작은 판 포기가 아니며 서버 활동을 지우지 않는다. 공원에는 복구 대기·이동 제한 가능 안내와 재시도 버튼을 유지하고, 서버 활동이 종료되거나 연결·계정·채널이 바뀌면 안내를 정리한다. ID를 확인한 판의 종료는 기존 포기 확인·서버 ACK 이후에만 처리한다.
- 이미 종료·만료된 판은 안내와 공원 복귀 경로를 표시한다. 복구 중 접속·계정·채널이 바뀌면 이전 응답을 화면에 적용하지 않는다.
- 서버의 재접속 활동 유지, 이동 제한, 납품 검증·정산·보상 계약과 DB 스키마는 변경하지 않는다.

### v4 납품 승인과 checkpoint 복구

`POST /api/v1/minigames/sessions/{id}/deliveries`

- `Authorization`, `Content-Type: application/json`, `Idempotency-Key`가 필수다.
- 본문은 최대 256KiB이고 압축 본문, 중복 JSON 키, 정의되지 않은 필드, 잘못된 행동별 필드를 거절한다.
- `actions`는 현재 checkpoint 다음부터 이번 `DELIVER`까지의 연속 prefix이며 마지막 행동은 헤더 키와 같은
  `deliveryKey`를 가진 `DELIVER`여야 한다. `throughSeq`, `prefixHash`, `orderId`도 서버 원본과 일치해야 한다.
- 같은 키·같은 본문은 최초 성공 또는 명시적 거부 응답을 DB에서 그대로 재생한다. 같은 키·다른 본문은
  `409 IDEMPOTENCY_KEY_CONFLICT`, 같은 주문의 다른 성공 키는 `409 ORDER_ALREADY_DELIVERED`다.
- 성공 시 승인 prefix와 checkpoint를 원자적으로 저장하고 현재 주문을 완료한 뒤 다음 주문 하나만 발급한다.
  다음 주문·영수증은 재시도에서 다시 추첨하거나 생성하지 않는다.
- 명시적 규칙 거부는 승인 상태를 바꾸지 않고 거부 영수증만 저장한다. FE는 같은 요청의 네트워크 유실이면
  같은 키·같은 본문을 재시도하고, 명시적 거부이면 GET 복구 결과로 checkpoint를 교체한 뒤 유효 후속 로그를 재생한다.
- 납품 승인에서는 점수 checkpoint만 확정하며 코인 지급, Wallet 잔액 변경, 거래 원장 생성은 하지 않는다.
  v4 최종 완료·일일 상한·Wallet 지급은 Story 3이다.

### v4 순수 규칙과 Story 경계

- 팥·슈크림·피자·초코 4종, 철판 6칸, 쟁반 최대 4개, 종류별 FIFO를 사용한다.
- 성공한 FILL마다 불 하나를 소비하며 같은 빵 양면에 같은 불을 사용한다. 폐기해도 불을 복원하지 않는다.
- 한 면은 기본 8000ms이고 40000ms부터 6000ms다. 서버와 FE가 같은 정수 계산·내림 순서를 사용한다.
- 품질은 RAW/GOOD/PERFECT/BURNT다. 콤보 3~5는 1.2배, 6 이상은 1.5배이며 빵별로 내림한다.
- 실패 빵은 제거한다. 정상 빵은 쟁반에 보관하고 실제 납품 때만 점수가 증가한다.
- 특수 재료 납품 보너스는 빵별 50% 내림이다. 미납품 빵은 최종 점수에 포함하지 않는다.
- Story 1의 순수 재계산기는 위 규칙과 다음 주문 생성 기반을 제공한다.
- **납품 승인 API, 영속 성공·거부 영수증, checkpoint 진행·복구는 Story 2, 최종 검증·멱등 정산·Wallet 지급은 Story 3으로 제공한다.**

### v4 최종 검증·보상 확정

`POST /api/v1/minigames/sessions/{id}/complete`

- v4는 `Idempotency-Key`가 필수다(누락·형식 오류는 `400 INVALID_REQUEST`, prefixHash 불일치는
  `400 LOG_HASH_MISMATCH`). 같은 키·같은 의미 본문은 최초 200을 재생하고 같은 키·다른 본문은
  `409 IDEMPOTENCY_KEY_CONFLICT`다. 다른 키라도 이미 확정된 같은 본문이면 기존 결과를 반환하며,
  다른 최종 본문은 `409 FINAL_RESULT_CONFLICT`다. v2 완료의 키 없는 기존 계약은 유지한다.
- 본문은 `rulesVersion=v4`, 전체 `throughSeq`, `prefixHash`, 최초부터 고정한 `log`, 선택 `seenTips`,
  참고용 `clientScore`다. 서버는 저장한 규칙·불·주문·승인 prefix로 전체 기록을 다시 계산하며 clientScore를
  점수나 지급 근거로 사용하지 않는다.
- 최초 수신은 `playEndsAt` 이상 `submitDeadline` 이하만 허용한다. 행동 시각은 0..59999ms이고,
  잠금 대기는 요청 수신 시각을 늦추지 않는다. 이른 요청은 `422 TOO_EARLY`로 판을 소비하지 않는다.
  `submitDeadline` 이후 수신은 `409 GAME_NOT_ACTIVE`이며, drain 중에는 판을 바꾸지 않아 기한 내 수신 후
  잠금을 기다린 완료가 이길 수 있다. `expiresAt` 이후에만 `INVALID`(SUBMISSION_EXPIRED/EXPIRED) 무보상으로 확정한다.
- 승인되지 않은 마지막 DELIVER 한 건은 원래 deliveryKey로 재검증한다. 합법이면 납품 영수증·다음 주문·완료를
  같은 트랜잭션에 저장한다. 그 뒤 suffix가 불법이면 새 납품 승인까지 전부 롤백한다.
- 보상은 `floor(score/15)`, 모든 미니게임 합산 KST 일일 500냥 잔여 한도 안에서 지급한다. 양수 지급만
  `MINIGAME_REWARD` 원장 한 건을 만들며 0냥도 검증된 판은 COMPLETED다. reserved_balance는 바꾸지 않는다.
- 완료 응답에는 기존 v2 공통 필드와 successfulMade/served/customersServed/specialServed/bonusScore,
  폐기·미납품·미완성 수, rewardDate/settledAt/finalThroughSeq/finalPrefixHash/configVersion이 포함된다.
- 완료 후 GET은 `result`에 같은 상세 결과를 반환한다. 기본 terminal 조회는 checkpoint=null,
  acceptedLog=[], issuedOrders=[]이며 `includeProgress=true`일 때만 마지막 진행 원본을 포함한다.

### v4 실제 BE 연동 Playwright

`frontend/tests/bungeoppang-backend-e2e/final-settlement.spec.ts`는 공원·인증만 계약 fixture로 두고
미니게임·지갑 HTTP를 격리 DB에 연결한 테스트 BE로 보낸다. 실제 FE 화면에서 팥 2개를 구워
59.6초 이후 납품하고 응답 전에 60초를 닫는다.

- 납품 요청이 BE에 닿기 전 complete 선행: complete가 원래 deliveryKey로 납품을 승인하고, 늦게 보낸 같은
  납품은 원래 영수증만 재생하며 결과 화면을 덮지 않는다.
- 납품 선행·ACK 지연과 complete 응답 유실: FE가 같은 판을 GET으로 복구하고 지급은 판마다 한 번이다.
- 지갑 잔액은 실제 Wallet API로 대조한다. 브라우저 Origin은 인증 경계 범위라 테스트 프록시가
  `Content-Type`·`Idempotency-Key`·테스트 토큰만 전달한다.

새 전용 DB로 `dev,db` BE를 띄우고 해당 DB에만 테스트 회원·지갑·로그인 세션을 만든 뒤 그 회원의
Access 토큰을 환경변수로 넘긴다. 공용 DEV·기존 개발 DB 주소는 사용하지 않는다.

```powershell
$env:ONTOP_E2E_API_BASE = 'http://127.0.0.1:<isolated-be-port>'
$env:ONTOP_E2E_ACCESS_TOKEN = '<isolated-db-member-access-token>'
# frontend에서 실행. 환경변수가 없으면 건너뛴다.
pnpm exec playwright test --config playwright.bungeoppang-backend.config.ts
```

### Story 3 확인한 검증 · 2026-10-27

Story 3 전용 MySQL 8.4 컨테이너의 새 DB에서만 실행했다. 공용 DEV·기존 개발 DB는 사용하지 않았다.

- BE 미니게임 단위·HTTP·OpenAPI 114건, `MinigameMySqlTests` 24건(완료/포기·완료/만료 경합, 원장 실패 롤백,
  불법 suffix 롤백 포함), 관련 MySQL 회귀(dev 보존 1·경기 정산 27·경기 시작 30·V112 업그레이드 1) 통과.
- 신규 DB에 V1~V126 적용 후 `dev,db` 기동과 JPA validate 통과. V124/V125는 변경하지 않았다.
- FE 타입 검사 2종, Vitest 603건, 프로덕션 빌드, v4 미리보기 Playwright 4건 통과.
- 실제 BE 연동 Playwright 1건 통과: 판마다 DELIVER t≈59.6초가 승인되고 COMPLETED 1건·보상 원장 1건·
  납품/완료 영수증 각 1건이며 지갑 증가는 지급 합계와 같았다.
- 3D 실제 OAuth 로그인·공용 DEV 배포·운영 부하는 이 검증 범위가 아니다.

## 기존 v2 계약

### MINI-01 · 시작

`POST /api/v1/minigames/sessions`

헤더: `Authorization: Bearer <Access JWT>`, `Content-Type: application/json`,
`Idempotency-Key: 영숫자/_/- 1~64자`.

```json
{
  "minigameType": "BUNGEOPPANG"
}
```

성공 HTTP 201:

```json
{
  "minigameSessionId": "901",
  "minigameType": "BUNGEOPPANG",
  "status": "PLAYING",
  "startedAt": "2026-10-23T00:00:00Z",
  "rulesVersion": "v2",
  "heats": [100, 85, 115],
  "isFirstGame": true
}
```

위 `heats`는 길이를 줄인 표시 예시다. 실제로는 85~115 정수 **64개**이며 FILL 순서대로 소비한다.
동일 회원·키 재요청은 최초 응답과 불 세기를 재현한다. 다시 하기는 새 키로 호출한다.
새 키 시작은 기존 진행 판을 ABANDONED로 종료한다. 본인별 활성 판은 하나다.
시작 제한 기본값은 명세의 예시인 60초당 10회이며 `ontop.minigames.starts-per-minute`로 조정한다.
같은 키 재시도는 제한 횟수를 추가 소비하지 않는다. 시작 시 잔액 차감/지급은 없다.

### MINI-02 · 조회

### 시작 화면

`GET /api/v1/minigames/sessions` → HTTP 200:

```json
{
  "todayEarned": 5,
  "dailyCap": 500,
  "isFirstGame": false,
  "seenTips": ["GOLD", "START"],
  "rulesVersion": "v2"
}
```

오늘은 Asia/Seoul 날짜다. 검증 완료 판이 한 번도 없으면 `isFirstGame=true`다.
포기·거부·만료 판은 첫 판 완료로 세지 않는다.

### 본인 판

`GET /api/v1/minigames/sessions/{minigameSessionId}` → HTTP 200:

```json
{
  "minigameSessionId": "901",
  "status": "PLAYING",
  "score": null,
  "rewardAmount": 0,
  "startedAt": "2026-10-23T00:00:00Z",
  "endedAt": null
}
```

상태는 기존 ERD의 PLAYING / COMPLETED / ABANDONED / INVALID를 유지한다.
명세의 VERIFIED는 COMPLETED, REJECTED/EXPIRED는 INVALID에 대응한다.
시작 후 10분 이상 지난 진행 판은 조회·완료·다음 시작에서 INVALID로 정리한다.
타인 판과 없는 판은 동일한 404다.

### MINI-03 · 완료·보상 확정

`POST /api/v1/minigames/sessions/{minigameSessionId}/complete`

```json
{
  "log": [
    { "slot": 0, "action": "POUR", "t": 180 },
    { "slot": 0, "action": "FILL", "t": 900 },
    { "slot": 0, "action": "TURN", "t": 6650 },
    { "slot": 0, "action": "TURN", "t": 12300 }
  ],
  "seenTips": ["GOLD"],
  "clientScore": 10
}
```

- `log` 필수, 최대 1200줄. slot 0~5, action POUR/FILL/TURN/DISCARD, t 0~60000 정수.
- 시각 역행·전체 50ms 미만 입력·동일 칸 300ms 미만 입력·상태 불일치·65번째 FILL은 거절한다.
- 재료 선택/아무 일도 일어나지 않은 입력은 로그에서 제외한다. 버려도 소비한 불 세기는 돌려놓지 않는다.
- FE는 카운트다운 3.5초 뒤 게임 시간을 0부터 센다. 서버는 판 발급 후 최소 60초 경과를 검사한다.
  TOO_EARLY는 판을 소모하지 않으므로 시간이 지난 뒤 같은 판으로 다시 제출할 수 있다.
- 40초 전은 한 면 8초, 이후는 6초로 계산하며 경계에 걸친 면은 시간을 나누어 정수 계산한다.
- 익힘 0~49/100 이상은 실패(물고기 전체 0점), 50~69/91~99는 면당 2점, 70~90은 면당 5점.
- 양면 황금은 콤보 +1, 일반 성공은 유지, 실패/버리기는 초기화. 갱신 후 3~5콤보 ×1.2,
  6 이상 ×1.5 적용, 소수는 버림. 끝에 남은 미완성 붕어빵은 0점이다.
- `clientScore`는 선택적인 비교 기록이며 지급 근거가 아니다. score/rewardAmount/userId 추가 필드는 400.
- `seenTips` 선택, 최대 5개. START/POUR/GOLD/BURNT/RUSH만 완료 시 합쳐 저장하고 모르는 키는 무시한다.

성공 HTTP 200 (양면 황금 7개 예시):

```json
{
  "minigameSessionId": "901",
  "status": "COMPLETED",
  "verifiedCompletedCount": 7,
  "rewardAmount": 5,
  "score": 86,
  "made": 7,
  "golden": 7,
  "failed": 0,
  "wasted": 0,
  "maxCombo": 7,
  "coinsCalculated": 5,
  "coinsGranted": 5,
  "todayEarned": 5,
  "dailyCap": 500,
  "capReached": false
}
```

15점당 1냥(나머지 버림), 한국 날짜 모든 미니게임 합산 하루 최대 500냥. 자정을 넘어 제출하면 제출 처리 날짜에 포함한다.
`verifiedCompletedCount`는 꺼낸 개수(made), `rewardAmount`는 실제 지급액(coinsGranted)과 같은 호환 필드다.
상한으로 0냥이어도 COMPLETED로 저장한다. 첫 결과를 저장하므로 재요청은 날짜·상한이 달라도 처음 응답을 반환한다.
세션 완료·보상·거래·결과·안내 저장은 한 트랜잭션이며 저장 실패 시 전부 롤백한다.

입력 검증 실패 HTTP 422:

```json
{
  "code": "LOG_INVALID",
  "message": "입력 기록을 확인할 수 없습니다.",
  "details": null,
  "detail": "ACTION_STATE_MISMATCH",
  "index": 0
}
```

거부된 입력과 첫 사유도 저장한다. 같은 판을 고친 로그로 재제출해도 처음 422가 반환된다.
이 검증은 규칙 위반을 걸러내며, 완벽하게 조작한 유효 로그·매크로까지 판별하는 보장은 아니다.

### MINI-04 · 포기

`POST /api/v1/minigames/sessions/{minigameSessionId}/abandon`, 본문 `{}`.
기존처럼 HTTP 200 `{ "minigameSessionId": "901", "status": "ABANDONED", "rewardAmount": 0 }`.
포기 재요청은 동일 응답, 완료한 판은 409로 보상을 취소하지 않는다.

## 오류·검증 경계

400 INVALID_REQUEST / UNSUPPORTED_MINIGAME, 401 인증 실패, 404 MINIGAME_NOT_FOUND,
409 IDEMPOTENCY_KEY_CONFLICT / RULES_VERSION_MISMATCH / MINIGAME_ALREADY_* / GAME_NOT_ACTIVE,
422 TOO_EARLY / LOG_INVALID, 429 TOO_MANY_STARTS,
503 MINIGAME_NOT_CONFIGURED / MINIGAME_UNAVAILABLE.

V111 이전 v2 판도 기존 상태 조회는 유지한다. 다만 재계산 원본이 없으므로 완료 제출은
RULES_VERSION_MISMATCH이며 새 판이 필요하다.
v4 Story 1 판에 기존 v2 완료 본문을 제출해도 RULES_VERSION_MISMATCH이며 납품·지급을 실행하지 않는다.
실제 프론트 연동·가게 배치·서버 배포와 API/격리 MySQL 검증은 별개다. 랭킹 API는 추가하지 않는다.

## 확인한 검증 · 2026-10-23

- Java21 전체 백엔드: 153 suites / 1305 tests, 실패·오류·스킵0. `test bootJar` 성공.
- `exportOpenApi` 실제 HTTP YAML 재생성·정적 명세 대조 성공. 새 조회 경로를 매핑 계약에 추가했다.
- 격리 MySQL8.4: 12개 통과. 실제 발급 불 세기·입력 재생, 본인 인증 HTTP 흐름, 동시 완료6건,
  완료/포기 경합, 지갑/원장 롤백·재시도, 구매와 보상 동시 증감, 일일 상한, 전날 보상 제외,
  만료, 동일 시작 키, 새 판의 이전 판 포기, 시작 횟수 제한을 검증했다. 검증 소스 대역은 제거했다.
- 테스트는 이번 작업 전용 `ontop_minigame_test_v2_20261023_1510`에서 실행했다. 기존 데이터 초기화 없음.
- Postman 생성 결과 `node postman/generate.mjs --check` 일치. 테스트 입력 생성은 개발용 예시이며
  실제 사람이 플레이했다는 근거가 아니다. 실제 FE 화면/운영 지갑 연동 성공으로 확대하지 않는다.

## 실제 프론트 서비스 연동 검증 · 2026-10-25

상점 구매와 완료 보상이 겹치는 HTTP/DB 검증은
[구매·붕어빵 보상 동시 처리](shop-inventory.md#구매붕어빵-보상-동시-처리)를 따른다.
구매 먼저·보상 먼저·구매 롤백 뒤 같은 키 재시도에서도 잔액·예약금·원장·영수증을 확인한다.
새 API·보상 규칙·경기 예약/정산 구현을 추가한 작업은 아니다.

`MinigameFrontendMySqlTests`는 현재 프론트의 `createBungeoppangService`와 `replayGrill`을 그대로
불러 실제 회원 JWT → Spring HTTP → JPA → 별도 MySQL8.4까지 연결한다. 시작/조회/완료/포기와
지갑 조회를 검증하며 응답 대역은 사용하지 않는다. 사용하지 않는 월드 런타임 singleton만 격리한다.

- 시작 키 재사용, 이른 완료의 재시도, FE/BE 점수 일치, 완료 재요청의 보상 1회 지급,
  다른 회원 접근 차단, 포기 재요청과 종료된 시작 영수증 거절: FE 시나리오 5개 통과.
- Java 통합 흐름 1개에서 실제 DB의 완료/포기 상태, 보상 거래 1건, 잔액 100→105,
  별도 회원 잔액·예약금 보존까지 확인했다. 기존 붕어빵 회귀 54개도 통과했다.
- 60초 대기를 줄이기 위해 해당 테스트 DB의 세션 시작 시각만 65초 전으로 조정했다.
  3D 화면 조작·실제 OAuth 제공자 로그인·개발 서버 배포 성공을 뜻하지 않는다.

실행 전 저장소 프론트 의존성과 Node를 준비하고, **새 전용 DB**를 사용한다. 기존 데이터가 있는 DB는
테스트가 거절하며 초기화하지 않는다. 신규 Flyway SQL은 추가하지 않는다.

```powershell
$env:TEST_MINIGAME_FRONTEND = 'true'
$env:TEST_MINIGAME_FRONTEND_DB_URL = 'jdbc:mysql://127.0.0.1:<port>/ontop_minigame_test_frontend_<unique>?serverTimezone=UTC'
$env:TEST_MINIGAME_DB_USERNAME = '<test-db-user>'
$env:TEST_MINIGAME_DB_PASSWORD = '<test-db-password>'
# backend 폴더에서 실행. JWT는 테스트가 발급하며 명령/파일에 저장하지 않는다.
.\gradlew.bat mysqlTest --tests 'com.ssafy.ontop.minigame.MinigameFrontendMySqlTests'
```

기본 백엔드 테스트에는 포함되지 않는다. `TEST_MINIGAME_FRONTEND=true`를 지정한 MySQL 검증에서만
실행하고, Vitest는 기존 `frontend/node_modules`를 재사용한다. API 경로·요청·응답 계약 변경은 없다.

## 실제 프론트 플레이 상태·60초 연동 검증

`BungeoppangFrontendFlowMySqlTests`는 기존 FE의 `store`·규칙·service·ParkRuntime/SharedSocket을
수정하지 않고 dev,db의 회원 인증·접속권·HTTP·Raw WebSocket·JPA·격리 MySQL에 연결한다.
시작 응답 유실 후 같은 키 재확인 → 실제 입력으로 양면 황금7개/86점 → 미완성 반죽1개 남김 →
탭 숨김 중에도 실제60초 진행 → 완료 응답 유실/동일 기록 재확인 →5냥 지급 → 잔액 응답 유실 후
지갑만 재조회 → 새 판 포기 → 새 접속권 복귀 후 일일 보상/잔액 복구를 확인한다.
미완성은 점수 제외이고 `wasted`는 명시적 DISCARD 횟수이므로 이 흐름에서는0이다.

브라우저 API·숨김 상태·응답 유실은 Node 어댑터다. 위치는 가게 앞의 신뢰된 서버 fixture로 고정하며
물리 시간만 동결한다. **게임/서버 시계와 DB 시작 시각은 바꾸지 않고 실제60초를 기다린다.**
실제 브라우저의 백그라운드 타이머 제한·3D 렌더링·걸어서 접근·외부 OAuth 제공자·개발 서버 배포는
별도 검수다. 포기/복귀 뒤 신규 지급이 없고 최종 지갑105/예약10·완료1·포기1·보상원장1을 Java에서
독립 SQL로 대조한다. 테스트 보존 회원의 지갑은 바뀌지 않아야 한다.

```powershell
$env:TEST_BUNGEOPPANG_FLOW = 'true'
$env:TEST_BUNGEOPPANG_FLOW_DB_URL = 'jdbc:mysql://127.0.0.1:<port>/ontop_minigame_test_flow_<unique>?serverTimezone=UTC'
$env:TEST_MINIGAME_DB_USERNAME = '<test-db-user>'
$env:TEST_MINIGAME_DB_PASSWORD = '<test-db-password>'
# backend에서 실행. Node24와 기존 frontend 의존성이 필요하다.
.\gradlew.bat mysqlTest --tests '*BungeoppangFrontendFlowMySqlTests'
```

빈 loopback 전용 DB만 허용하며 기존 데이터 삭제/초기화·신규 Flyway·제품/팀원 소스 변경은 없다.
인증값은 자식 프로세스 환경으로만 전달하고 진단에는 성공 여부·점수·지급액만 남긴다.
