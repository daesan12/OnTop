# 붕어빵 미니게임 API · v2

기준: 2026-10-23 수신한 `붕어빵_뒤집기_최종기획.md`, BE·FE 작업명세와 사용자 확정 사항.
이 문서는 기존 MINI-01~04 경로를 유지한 구현 계약이다. 랭킹은 제외하고 탭 이동 중에도 시간은 흐른다.
가게 위치·캐릭터 배치는 미정이며 이 REST 흐름을 막지 않는다.

## 실행과 저장

- 기존 Access JWT와 활성 회원 인증을 재사용한다. 사용자 ID는 인증에서 가져오고 요청 본문에서 받지 않는다.
- `local,db` + `ontop.minigames.enabled=true`, 또는 `dev,db`에서 활성화한다. dev는 기본 활성화한다.
- `prod`/`production`을 함께 켜면 미니게임 컨트롤러·저장소·서비스·CORS 예외를 등록하지 않는다.
- Flyway locations: `classpath:db/migration,classpath:db/minigame`. 상점도 쓰면 `classpath:db/shop` 추가.
- V110 기존 공통 세션/시작 영수증 유지. V111은 붕어빵 전용 입력·불 세기·최초 결과를 보관하는
  `bungeoppang_records`, 안내 이력 `bungeoppang_profiles`와 일일 보상 조회 인덱스를 추가한다.
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
  V110/V111의 미니게임 테이블·인덱스만 추가한다. `ddl-auto=validate`와 Flyway 검증을 유지한다.
  `clean`/`repair`/`out-of-order`나 기존 스키마 초기화는 사용하지 않는다.
- 기존 공통 마이그레이션 V1~V6가 먼저 적용된 DB를 기준으로 한다. 이미 고번호 V100/V110 등을
  적용했지만 V5/V6가 없는 별도 DB는 먼저 이력을 확인해야 한다. 이 MR은 그런 DB를 임의 복구하지 않는다.
- 이미 지갑이 있는 정상 회원으로 시작·조회·완료를 연동한다. 기존 회원의 지갑 생성은 별도 관리 작업이다.
- 이 설정은 MR 병합 후 개발 이미지 재빌드·배포 때 적용된다. MR 생성/로컬 검증만으로 원격 반영을 뜻하지 않는다.

## MINI-01 · 시작

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

## MINI-02 · 조회

### 시작 화면

`GET /api/v1/minigames/sessions` → HTTP 200:

```json
{
  "todayEarned": 5,
  "dailyCap": 100,
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

## MINI-03 · 완료·보상 확정

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
  "dailyCap": 100,
  "capReached": false
}
```

15점당 1냥(나머지 버림), 한국 날짜 하루 최대 100냥. 자정을 넘어 제출하면 제출 처리 날짜에 포함한다.
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

## MINI-04 · 포기

`POST /api/v1/minigames/sessions/{minigameSessionId}/abandon`, 본문 `{}`.
기존처럼 HTTP 200 `{ "minigameSessionId": "901", "status": "ABANDONED", "rewardAmount": 0 }`.
포기 재요청은 동일 응답, 완료한 판은 409로 보상을 취소하지 않는다.

## 오류·검증 경계

400 INVALID_REQUEST / UNSUPPORTED_MINIGAME, 401 인증 실패, 404 MINIGAME_NOT_FOUND,
409 RULES_VERSION_MISMATCH / MINIGAME_ALREADY_* / GAME_NOT_ACTIVE,
422 TOO_EARLY / LOG_INVALID, 429 TOO_MANY_STARTS,
503 MINIGAME_NOT_CONFIGURED / MINIGAME_UNAVAILABLE.

V111 이전 판은 불 세기가 없어 RULES_VERSION_MISMATCH이며 새 판이 필요하다.
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
