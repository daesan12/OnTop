# 엽전 보유량 행사 결과 (S15P31B105-355, S15P31B105-451)

## 이번 회차

- `2026-11-09` 월요일 09:00 KST부터 `2026-11-19` 목요일 00:00 KST 직전까지의 엽전 보유량을 사용한다. 마감 뒤 5분이 지나야 확정하며 회원에게는 11월 19일 09:00 KST부터 발표한다.
- 의상 가치는 아직 확정되지 않아 **포함하지 않는다**. `valuationBasis=COIN_BALANCE`로 응답하고, 의상 가격·소유 이력까지 합산하는 작업은 가격 정책 확정 후 별도로 설계한다.
- 1등 황올+크리스피+콜라, 2등 스타벅스 세트, 3등 싸이버거 세트를 각 1명에게 준다. `ADMIN_READ_IDS`에 등록된 GM과 운영 검토를 마친 `EVENT_AWARD_EXCLUDED_USER_IDS` 회원은 후보에서 제외한다. 환경변수에는 쉼표로 구분한 내부 회원 ID만 넣는다.

## 마감 시점 잔액과 동점 기준

`wallets.balance`는 예약금을 포함한 총 보유 엽전이다. 현재 잔액에서 행사 시작 이후의 모든 `wallet_transactions.balance_delta`를 역산해 시작 잔액을 구하고, 마감 직전까지의 거래만 다시 더한다. `reserved_delta`와 `wallets.updated_at`은 순위에 사용하지 않는다. 따라서 마감 뒤의 지급·구매·예약은 선정 결과를 바꾸지 않는다. 각 회원의 마감 잔액, 최초 도달 시각, 해당 거래 ID 또는 시작 잔액 근거를 `event_asset_snapshots`에 고정한다.

정렬은 마감 잔액 내림차순, **행사 시작 시점부터** 그 잔액에 처음 도달한 시각 오름차순, 동일 밀리초에는 회원 ID 오름차순이다. 시작 시점부터 이미 마감 잔액을 가진 회원의 최초 도달 시각은 행사 시작으로 기록한다. 당첨 기록은 `event_winners`에 저장하고 재실행 시 같은 결과를 반환한다. `event_finalization_attempts`에 실행 결과를 기록한다. 원장과 잔액이 모순되거나 복원 중 오버플로가 생기면 확정하지 않는다.

## API 및 배포

| API | 권한 | 결과 |
| --- | --- | --- |
| `GET /api/v1/events/assets/rounds/2026-11-09/result` | 로그인 회원 | 발표 전 `NOT_ANNOUNCED`, 지연 시 `PENDING`, 발표 후 본인의 `SELECTED`·`NOT_SELECTED` |
| `GET /api/v1/admin/events/assets/rounds/2026-11-09` | 관리자 조회 | 후보·GM 제외 수, 1~3등의 잔액·근거 |
| `GET /api/v1/admin/events/assets/rounds/2026-11-09/preview` | 관리자 조회 | DB를 쓰지 않고 후보·제외 수와 상위 3명의 원장 근거를 미리보기 |
| `POST /api/v1/admin/events/assets/rounds/2026-11-09/finalize` | 관리자 운영 | 미리보기의 후보·제외 수·근거 ID가 모두 같을 때만 확정 |

확정 본문은 직전 미리보기의 값을 그대로 보낸다. 순위가 달라지면 `409 EVENT_RANKING_CHANGED`이고 다시 미리봐야 한다.

```json
{"candidateCount": 20, "excludedGmCount": 3, "expectedSourceRecordIds": ["wallet_transaction:101", "wallet:5:opening", "wallet_transaction:93"]}
```

응답은 `Cache-Control: no-store`이며 회원 API는 다른 사람의 결과를 공개하지 않는다. DEV·운영의 `ASSET_AWARD_ENABLED`는 기본 `false`다. 공통 V154 마이그레이션과 관리자 ID를 검증한 뒤 `true`로 켜고 앱을 재생성한다. 이번 소급 정산은 반드시 `ASSET_AWARD_AUTO_ENABLED=false`로 두고 관리자 미리보기 후 수동 확정한다. `ASSET_AWARD_WEEK`는 `2026-11-09`만 허용한다.

현재 원장에는 `balance_after`가 없으므로 이 방식은 행사 시작 이후 모든 잔액 변경이 동일 트랜잭션에서 `wallet_transactions`에 기록된다는 전제에 의존한다. 운영 중 지갑 잔액을 SQL로 직접 수정하면 이 전제가 깨진다. 역산 결과가 음수이거나 오버플로되면 확정이 중단되지만, **양수로 남는 누락 거래는 자동 검출할 수 없어 잘못된 순위를 만들 수도 있다.** 행사 기간에는 수동 잔액 변경을 금지하고 정규 지갑·원장 처리 경로만 사용해야 한다. 향후 의상 가치 합산 시에는 마감 시점 의상 소유·가격 이력의 고정 방식까지 함께 정해야 한다.
