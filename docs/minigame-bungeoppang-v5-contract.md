# 붕어빵 v5 FE·BE REST 계약과 구현 상태

- 작성일: 2026-10-28 (Asia/Seoul)
- 범위: Story 251(규칙·검증 계약), 252(시작·주문 저장·복구), 254(이용 상태 말풍선), 253(선택 납품·충원·최종 정산)
- 상태: **BE 구현 완료, 기본 비활성.** 서버 설정 `ontop.minigames.bungeoppang-v5-enabled=true`가 없으면
  v5 시작·로비 요청은 기존처럼 409 `RULES_VERSION_MISMATCH`다. FE·BE 통합 검증(V5-5) 전까지 켜지 않는다.
- 규칙 원본: `docs/bungeoppang-v5/` 의 최종기획·BE/FE 작업명세. 이 문서는 서버가 실제로 받는 형식만 적는다.

## 1. 공통

- 경로는 v4와 같다: `/api/v1/minigames/sessions`. 요청 본문 `rulesVersion`으로 v5를 고른다.
- 신규 판 `configVersion`은 `v5-20261102.1`(2분, 피자·초코 납품 보너스 30%)이다. 기존 판은 발급 당시
  `rules.specialBonusPercent`(50%)와 `configVersion`을 유지한다. 2026-10-29 이전 판은 `v5-20261027.1`(3분)을
  유지한다(7절). 행동 tuple·필드 규칙은 v4와 같고, prefix hash seed만
  `BUNGEOPPANG/v5\n{sessionId}\n{configVersion}\n`이며 판에 저장된 `configVersion`을 쓴다.
- 행동 시각과 가속은 판에 저장된 `rules`를 따른다. 신규 판은 `0 <= t < 120000`, 가속 `90000 <= t`.
  기존 3분 판은 `0 <= t < 180000`, 가속 `150000 <= t`. 로그는 두 판 모두 최대 3600건.
- v5 납품·완료 본문은 최대 1 MiB(1,048,576 byte). v4와 v2는 기존 256 KiB를 유지한다.
- 오류 envelope은 v4와 같다(`code`, `message`, `detail`, `index`, 납품 거부 시 `recovery`).

## 2. 시작 · `POST /sessions` `{"minigameType":"BUNGEOPPANG","rulesVersion":"v5"}`

- 응답: `rulesVersion`, `configVersion`, `timing`(신규 판은 재생 시작 후 120초), `rules`(`heatAssignment:"FILL"`,
  `maxActiveOrders:3` 포함), 불 2048개, `checkpoint`(revision 0, throughSeq 0, `activeOrders` 3건).
- 첫 주문은 `orderId` `"1"`~`"3"`(십진수 문자열), `customerSlot` 0·1·2, `availableAfterSeq` 0.
  첫 주문만 팥 2개 고정이고 나머지는 v4와 같은 분포다.
- 같은 `Idempotency-Key` 재시도는 **항상 최초 시작 응답**을 돌려준다. 납품이 승인된 뒤에도 시작 응답의
  checkpoint는 throughSeq 0의 시작 상태이며, 현재 상태는 GET으로 조회한다.

## 3. 선택 납품 · `POST /sessions/{id}/deliveries`

요청은 v4와 같은 형식이다. 마지막 행동이 `DELIVER`이고 그 `deliveryKey`가 `Idempotency-Key`와 같아야 한다.

```json
{ "rulesVersion": "v5", "throughSeq": 9, "prefixHash": "<64 hex>",
  "log": [ ..., { "seq": 9, "action": "DELIVER", "t": 26400, "orderId": "2", "deliveryKey": "k-2" } ] }
```

승인 응답(200):

```json
{ "minigameSessionId": "901", "deliveryKey": "k-2", "orderId": "2", "accepted": true,
  "acceptedAt": "...", "throughSeq": 9, "prefixHash": "<요청과 같음>",
  "consumedBreadIds": [1], "scoreDelta": 10, "bonusDelta": 0,
  "replacementOrder": { "orderId": "4", "customerSlot": 1, "availableAfterSeq": 9, "items": { ... } },
  "checkpoint": { "revision": 1, "throughSeq": 9, "prefixHash": "...", "activeOrders": [ ...충원 포함 3건 ] } }
```

- 활성 주문 3건 중 어느 것이든 고를 수 있다. 주문 전체 수량이 있어야 하고 빵은 종류별로 먼저 만든 것부터 쓴다.
- 승인 즉시 비운 손님 자리에 다음 주문을 발급한다: `orderId` = 판의 마지막 ID + 1,
  `availableAfterSeq` = 승인한 DELIVER의 seq. `replacementOrder`는 checkpoint의 `activeOrders`에 있는 주문과 같다.
- 납품에서는 Wallet·원장을 바꾸지 않는다.
- 같은 키·같은 본문 재시도는 최초 응답(성공 또는 거부)을 그대로 재생하고 주문을 다시 만들지 않는다.
  같은 키·다른 본문은 409 `IDEMPOTENCY_KEY_CONFLICT`.

| 상황 | 응답 |
| --- | --- |
| 승인된 prefix와 다른 로그(같은 revision의 경쟁 요청 포함) | 409 `PREFIX_MISMATCH` |
| 이미 승인된 주문 | 409 `ORDER_ALREADY_DELIVERED` |
| 해당 로그 위치에서 활성 주문이 아님(없는 주문·아직 발급 전 충원 주문) | 409 `STALE_ORDER` |
| 수량 부족·탄 빵 조작 등 규칙 거절 | 422 `DELIVERY_REJECTED` (`detail`에 규칙 사유) |
| 서버 시각보다 앞선 행동 | 422 `TIME_AHEAD` |
| prefix hash 불일치 | 400 `LOG_HASH_MISMATCH` |
| 종료된 판·제출 기한 경과 | 409 `GAME_NOT_ACTIVE` |

거부 응답은 영수증에 남고 `recovery`의 승인 경계로 `GET ?includeProgress=true` 복구를 안내한다.

## 4. 조회·복구 · `GET /sessions/{id}?includeProgress=true`

- 마지막 승인 checkpoint, `acceptedLog`, 서버가 발급한 주문 전체(`issuedOrders`, 발급 순서)를 돌려준다.
  `acceptedLog`의 v5 prefix hash는 checkpoint의 `prefixHash`와 같다.
- `includeSource=true`이면 규칙·불·시작 시각을 함께 준다. 완료된 판은 `result`에 완료 응답과 같은 형식을 담는다.

## 5. 완료 · `POST /sessions/{id}/complete`

- 본문은 v4와 같다(`rulesVersion:"v5"`, `throughSeq`, `prefixHash`, `log`, `seenTips`, `clientScore`).
- `playEndsAt` 이전은 422 `TOO_EARLY`(상태 유지), `submitDeadline` 이후는 409 `GAME_NOT_ACTIVE`이며
  `expiresAt`이 지나면 판을 무효(`SUBMISSION_EXPIRED`)로 닫는다.
- 최종 로그는 승인된 prefix로 시작해야 한다. 끝에 남은 미승인 `DELIVER` **한 건**은 같은 트랜잭션에서 납품
  규칙으로 먼저 승인하고 충원 주문까지 반영한다. 두 건 이상이면 422 `LOG_INVALID`(`detail`: `TOO_MANY_PENDING_DELIVERIES`).
- 점수는 서버 재계산값만 쓴다. 보상은 v4와 같다: `floor(score / 15)`냥, 회원별 모든 미니게임 합산 KST 일일 500냥 상한
  (v2·v4·v5 공통). 같은 판은 한 번만 지급하고 다른 키의 같은 본문은 같은 결과, 다른 본문은 409 `FINAL_RESULT_CONFLICT`.
- 응답 형식은 v4 완료 응답과 같고 `rulesVersion`이 `"v5"`다.
- 완료가 커밋되면 월드의 `activity`(붕어빵 이용 상태)를 해제한다.

## 6. 통합 검증(V5-5)과 활성화 조건 · 2026-10-28

- OpenAPI(`/v3/api-docs`)에 v5를 반영했다: 시작·로비 `rulesVersion` 목록에 `v5`(기능 플래그 설명 포함),
  납품·완료 요청의 v5 항목(로그 3600건, `t` 최대 179999), `BungeoppangV5StartResponse`·`DeliveryResponse`·
  `SessionResponse`. v4 스키마(로그 1200건, `t` 최대 59999)는 그대로다. v5 `t` 최대값 179999는 기존 3분 판까지
  받는 스키마 상한이며, 판별 상한(`rules.durationMs - 1`)은 서버가 판에 저장된 규칙으로 검사한다(7절).
- FE·BE 공통 한 판 `frontend/tests/fixtures/bungeoppang-v5-flow.json`(3분 판, 변경하지 않음)과
  `bungeoppang-v5-2min-flow.json`(2분 판, 가속 구간 행동만 90초 기준으로 이동)은 납품 3건·충원 3건·탄 빵 폐기·러시·
  쟁반 폐기의 결과가 같다. FE는 `bungeoppangV5Flow.test.ts`(규칙 replay·실제 어댑터 요청 본문·해시), BE는
  `BungeoppangV5FixtureContractTests`(판 규칙별 replay)와 `BungeoppangV5MySqlTests`(격리 MySQL·실제 HTTP, 2분 판과
  저장된 3분 판 각각)로 같은 결과를 확인한다. 응답 유실 재전송, 새로고침 복구(승인된 prefix만 복원),
  오래된 revision 거절, 종료 전 완료(`TOO_EARLY`), 완료 응답 유실 재시도, 판 교체 후 이용 상태도 같은 테스트에서 확인한다.
- 납품 처리 시간은 격리 테스트 환경 측정값이다(운영 목표·DEV 성능이 아님). 같은 테스트가 매 실행마다 표준 출력으로
  다시 기록한다. 조건: 로컬 격리 MySQL, 워밍업 없음(100건부터 차례로 측정해 앞쪽 수치에 JIT·커넥션 준비가 섞임),
  크기별 서비스 3회(평균·최대)·HTTP 1회·규칙 replay 20회. 최대 목표 3600건은 유효 로그 약 3515건이다.
  50ms 간격이면 180초에 3600건이지만 빵 두 개를 굽는 동안 같은 칸 300ms 간격을 지킬 수 있는 칸이 넷뿐이다.
  이 최대 길이 로그는 저장된 3분 판에서만 만들 수 있어 측정은 3분 판으로 한다(2분 판은 최대 2400건).
- 이 테스트들은 BE가 실제로 보낸 응답을 FE 어댑터가 읽는 경로까지는 확인하지 않는다(FE 어댑터 테스트는 FE replay로 만든 응답을 쓴다).
  DEV 활성화 때 실제 화면에서 확인한다.
- 실제 활성화는 별도 승인·배포 단계다. 다음을 확인한 뒤 BE `ontop.minigames.bungeoppang-v5-enabled=true`와
  FE `VITE_BUNGEOPPANG_RULES_VERSION=v5`를 함께 켠다.
  1. 최신 dev의 Jenkins 테스트 성공
  2. 대상 DEV DB에 V128 적용(`flyway_schema_history`)
  3. 활성화할 FE·BE 배포 SHA가 이 계약을 포함
  4. 실제 브라우저에서 v5 화면(손님 3명·충원·러시·결과·말풍선)과 v4 복귀 확인

## 7. 신규 2분 판과 기존 3분 판 · 2026-10-29

요청 문서: `docs/bungeoppang-v5/BE_2분_플레이_변경요청_2026-10-29.md`. 요청 형식 `rulesVersion:"v5"`와 응답 필드는 그대로다.

| 항목 | 신규 판 `v5-20261029.1` | 기존 판 `v5-20261027.1` |
| --- | --- | --- |
| `rules.durationMs` / `playEndsAt` | 120000 / `playStartsAt + 120000ms` | 180000 / `playStartsAt + 180000ms` |
| `rules.rushFromMs` (FE 가속 예고) | 90000 (87000) | 150000 (147000) |
| 유효 행동 시각 | `0 <= t < 120000` | `0 <= t < 180000` |
| 시작 버퍼 / 카운트다운 | 1000ms / 3500ms, 플레이 시간에 포함하지 않음 | 같음 |
| 제출 유예 / 처리 여유 | 15000ms / 10000ms (`submitDeadline` = 종료 + 15초, `expiresAt` = 종료 + 25초) | 같음 |
| 보관·손님·익힘·불·로그 한도·보상 | 10개 · 최대 3명 · 평시 8초/가속 6초 · 2048개 · 3600건 · `floor(score/15)`냥, 전체 미니게임 합산 일 500냥 | 같음 |

- 경계: 신규 판은 `t=89999` 평시, `t=90000`부터 가속, `t=119999` 입력 가능, `t=120000` 거절
  (납품은 422 `TIME_AHEAD`, 최종 로그는 422 `LOG_INVALID`/`BAD_ENTRY`). `playEndsAt` 이전 완료는 422 `TOO_EARLY`.
- 판별 규칙: 시작 때 그 시점의 규칙을 판 원본(`bungeoppang_v4_rounds.config_version`, `config_json`)에 저장한다.
  납품의 전·후·충원 재계산, 완료 정산, 시작 멱등 재생의 checkpoint, 행동 시각 검증, 만료는 모두 판에 저장된
  규칙과 시각을 쓴다. 상수가 바뀌어도 이미 발급된 판에는 닿지 않는다.
- 기존 3분 판: 배포 전에 시작한 판은 저장된 180초·150초 규칙, 해시 seed, 타임라인, checkpoint로 그대로 진행·재접속·
  완료·재시도한다. 120초 이후 행동과 150초 가속도 원래대로 인정한다. 기존 행을 일괄 수정하거나 마이그레이션하지 않는다.
- 랭킹: 아래 8절처럼 v5 랭킹을 판에 저장된 플레이 시간으로 2분·3분 분리한다. 기존 기록은 삭제·초기화하지 않는다.

## 8. 전체 랭킹 · `GET /api/v1/minigames/bungeoppang/rankings` · 2026-10-29

`?period=ALL_TIME&rulesVersion=v4|v5&limit=1..20[&durationMs=120000|180000][&cursor=…]`

- v5는 판 원본의 `play_ends_at - play_starts_at`(저장된 플레이 시간)이 같은 기록끼리만 집계한다. `durationMs`를 생략하면
  신규 판 길이 `120000`, `180000`이면 기존 3분 판 기록이다. 같은 길이의 서로 다른 `configVersion`은 함께 집계한다.
- 그 밖의 값은 400 `RANKING_INVALID_DURATION`. v4는 기존 조회 그대로이며 `durationMs`를 지정하면 같은 400이다.
- 응답에 `durationMs`를 추가했다(v5는 조회한 시간, v4는 `null`). 2026-10-31부터 개인 최고 점수·같은 판의 최대 콤보 순서로 선정하며 두 값이 같으면 공동 순위다.
- 스냅샷은 시간까지 구분한다. 다른 `durationMs`로 커서를 다시 쓰면 409 `RANKING_SNAPSHOT_EXPIRED`이며 커서 형식·서명은 같다.
- FE는 결과 화면에서 그 판에 저장된 `rules.durationMs`를 함께 보내고, 응답·다음 페이지의 `durationMs`가 같은지 확인한다.
  배포 순서는 BE 먼저다. FE만 먼저 배포되면 기존 BE 응답에 `durationMs`가 없어 v5 랭킹을 표시하지 않는다.

## 9. F1 설명서 일시정지 · 2026-10-31

- 붕어빵 v4/v5만 해당한다. 보드게임의 서버 턴·제한시간은 계속 흐른다. 탭 전환·브라우저 숨김은 자동 정지가 아니다.
- 본인 세션에 `POST /api/v1/minigames/sessions/{id}/manual-pause`로
  `{ "paused": true, "expectedPauseRevision": 0 }`을 보낸다. 닫을 때는 최신 버전과 `paused:false`를 보낸다.
  기존 Access JWT·회원 권한·지갑 행 잠금으로 직렬화한다. 같은 상태 재요청은 상태를 반복 변경하지 않는다.
- 응답은 기존 세션 조회 구조다. `timing.paused`와 `timing.pauseRevision`이 추가되며 GET에서도 현재 정지 상태를 읽는다.
  다른 상태로 바꾸는 낡은 버전은 409 `MANUAL_PAUSE_CHANGED`, 정지 중 새 납품·완료는 409 `MINIGAME_PAUSED`다.
  이미 확정된 동일 키 영수증은 계속 재조회할 수 있다.
- 원래 시간 원점은 변경하지 않고 정지 구간을 제외한 시간으로 로그·완료·만료를 검사한다. 응답의 시간 창은 정지 시간만큼
  모두 같은 폭으로 이동한다. 따라서 조리·손님 입장·남은 시간은 멈추며 2분·3분 랭킹 구분은 유지한다.
- FE는 열기·닫기를 순서대로 확인하고, 확인 실패 시 조작을 잠근 채 재확인을 제공한다. 단순히 화면 숫자만 멈추지 않는다.
- migration: `db/minigame/V132__add_bungeoppang_manual_pause.sql` (사용자 번호 확인 완료).
  기존 migration은 변경하지 않는다. 운영 활성 Flyway locations에 `db/minigame`을 포함해 V132를 적용한 BE를 먼저 배포한다.
- 새 DB 적용 및 V131의 기존 판을 보존한 순차 적용, 실제 HTTP 정지·재개·0점 완료·중복 완료와 점수 랭킹을 MySQL 8.4로 검증한다.
