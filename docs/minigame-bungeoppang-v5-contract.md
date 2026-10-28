# 붕어빵 v5 FE·BE REST 계약과 구현 상태

- 작성일: 2026-10-28 (Asia/Seoul)
- 범위: Story 251(규칙·검증 계약), 252(시작·주문 저장·복구), 254(이용 상태 말풍선), 253(선택 납품·충원·최종 정산)
- 상태: **BE 구현 완료, 기본 비활성.** 서버 설정 `ontop.minigames.bungeoppang-v5-enabled=true`가 없으면
  v5 시작·로비 요청은 기존처럼 409 `RULES_VERSION_MISMATCH`다. FE·BE 통합 검증(V5-5) 전까지 켜지 않는다.
- 규칙 원본: `docs/bungeoppang-v5/` 의 최종기획·BE/FE 작업명세. 이 문서는 서버가 실제로 받는 형식만 적는다.

## 1. 공통

- 경로는 v4와 같다: `/api/v1/minigames/sessions`. 요청 본문 `rulesVersion`으로 v5를 고른다.
- `configVersion`은 `v5-20261027.1`. 행동 tuple·필드 규칙은 v4와 같고, prefix hash seed만
  `BUNGEOPPANG/v5\n{sessionId}\n{configVersion}\n`이다.
- 행동 시각은 `0 <= t < 180000`, 가속은 `150000 <= t`. 로그는 최대 3600건.
- v5 납품·완료 본문은 최대 1 MiB(1,048,576 byte). v4와 v2는 기존 256 KiB를 유지한다.
- 오류 envelope은 v4와 같다(`code`, `message`, `detail`, `index`, 납품 거부 시 `recovery`).

## 2. 시작 · `POST /sessions` `{"minigameType":"BUNGEOPPANG","rulesVersion":"v5"}`

- 응답: `rulesVersion`, `configVersion`, `timing`(재생 시작 후 180초), `rules`(`heatAssignment:"FILL"`,
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
- 점수는 서버 재계산값만 쓴다. 보상은 v4와 같다: `floor(score / 15)`냥, 회원별 KST 일일 합계 100냥 상한
  (v2·v4·v5 공통). 같은 판은 한 번만 지급하고 다른 키의 같은 본문은 같은 결과, 다른 본문은 409 `FINAL_RESULT_CONFLICT`.
- 응답 형식은 v4 완료 응답과 같고 `rulesVersion`이 `"v5"`다.
- 완료가 커밋되면 월드의 `activity`(붕어빵 이용 상태)를 해제한다.
