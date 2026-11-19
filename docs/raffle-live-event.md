# 응모권 공개 추첨 행사 — S1 마감 보정·회차 연결·확정 잠금

기준 문서: `OnTop_Raffle_Live_Event_Plan_v1.7` (B안: 행사 전에는 `REVIEW`까지만, 행사를 마칠 때 서버가 확정).

행사 정책: 11/09 09:00 KST부터 11/19 00:00 KST 직전까지 산 유효 응모권을 하나의 공개 추첨에 넣는다. 추첨·확정·발표는 행사 회차인 **2026-11-16**에서 진행한다. 응모권·응모 번호·지갑 거래와 구매 API는 바꾸지 않는다.

## 판매 기간 재정의 hotfix와의 관계

판매 기간과 구매 회차 선택은 운영 hotfix `hotfix/S15P31B105-437-raffle-sales-window`(`RAFFLE_SALES_OVERRIDE_*`, [raffle-sales-window.md](raffle-sales-window.md))가 담당하고, S1은 그 결과를 받아 추첨·확정만 다룬다. 두 변경은 같은 파일을 고치지 않는다.

| 환경 | 응모권이 저장되는 DB 회차 | 1인 구매 한도 | S1 통합 추첨 후보 |
| --- | --- | --- | --- |
| hotfix 활성화(재정의 값 세 개 설정) | 11/09~11/18 구매분이 모두 2026-11-09 회차에 저장된다. 11/09 회차 판매가 11/19 00:00 KST까지 이어지고, 그 기간에는 11/16 회차에서 판매하지 않는다. | 2026-11-09 회차 하나에 적용되므로 **행사 전체 50장** | 11/09 회차(늘어난 판매 기간 기준). V182가 만든 11/16 회차는 비어 있는 행사 기준점이다. |
| hotfix 미적용 | 기존 주간 규칙대로 11/09 회차(11/16 00:00 KST 마감)와 11/16 회차(V182로 11/19 00:00 KST 마감)에 나뉘어 저장된다. | DB 회차별 50장(두 회차 합계 최대 100장) | 11/09 회차 + 11/16 회차 |

- 어느 경우든 응모권은 각 회차의 판매 기간 안에서만 후보가 되고, 응모권 한 장이 한 표이며, 한 회원은 한 번만 당첨된다.
- **관리자 공개 추첨은 11/09 단독 회차가 아니라 S1의 11/16 행사 회차에서 진행한다.** 11/09 회차는 사전 추첨·재추첨·직접 확정이 모두 막혀 있다. 그래서 hotfix가 막는 상태(재정의 대상 회차에 `event_rounds`가 생긴 상태)도 생기지 않는다.
- 복권방 화면은 hotfix 활성화 시 2026-11-09 회차를, 미적용 시 2026-11-16 회차를 보여 준다. FE 행사 일정(`liveEventSchedule`)은 두 회차 모두 같은 행사 안내를 표시한다.

## V182가 하는 일

`V182__register_raffle_live_event_20261116.sql`은 2026-11-09·11-16 회차에만 적용된다. 응모권(`raffle_tickets`) 행과 지갑 거래는 변경하지 않는다.

| 항목 | 내용 |
| --- | --- |
| 11/16 판매 마감 | `raffle_rounds.sales_ends_at`을 `2026-11-18 15:00:00` UTC(11/19 00:00 KST)로 당긴다. 11/18 23:59:59.999 KST까지 구매할 수 있다. 행이 없으면 판매 시작 `2026-11-16 00:00:00` UTC로 만들고, 행이 있으면 기존 주간 종료값 `2026-11-22 15:00:00` UTC일 때만 바꾼다. 다른 값이면 덮어쓰지 않는다. |
| 행사 회차 등록 | `raffle_live_events`에 11/16 회차를 `READY`/`MIGRATION`으로 등록한다. 마감값과 관계없이 등록한다. |
| 회차 연결 | `raffle_live_event_rounds`에 11/16과 11/09 주차를 연결한다. 11/09는 회차가 있고 아직 최종 확정되지 않았을 때만 `raffle_round_id`를 넣는다. 회차가 없거나 이미 확정됐으면 `NULL`(연결 실패)로 남기고 기존 결과는 바꾸지 않는다. |
| 당첨 후보 외래키 | 후보(`event_raffle_draw_picks`)가 다른 회차 응모권을 담을 수 있도록 `(응모권, 회차, 회원)` 외래키를 `(응모권, 회원)` 외래키로 바꾼다. 새 외래키를 먼저 만들고 기존 외래키를 지운다. 이를 위해 `raffle_tickets`에 `(id, user_id)` 유일 인덱스를 추가한다. 후보의 `raffle_round_id`는 행사 회차(11/16)로 기록된다. |
| 시간대 | 파일 첫 줄에서 세션을 `+00:00`으로 고정한다. 리터럴은 모두 UTC다. |

마이그레이션은 값이 예상과 달라도 실패하지 않는다. 결과는 아래 검증 스크립트로 판정한다.

## 추첨·확정 규칙

| 회차 | 사전 추첨·재추첨 | 관리자 직접 확정 | 행사 완료 내부 확정 |
| --- | --- | --- | --- |
| 11/16 (행사 회차) | 허용. 연결된 두 회차 응모권으로 추첨 | `409 RAFFLE_LIVE_EVENT_LOCKED` | 허용 |
| 11/09 (포함 회차) | `409 RAFFLE_LIVE_EVENT_SOURCE_ROUND` | `409 RAFFLE_LIVE_EVENT_LOCKED` | `409 RAFFLE_LIVE_EVENT_SOURCE_ROUND` |
| 행사와 무관한 회차 | 기존과 같음 | 기존과 같음 | `409 RAFFLE_LIVE_EVENT_NOT_REGISTERED` |

- 11/09 연결이 끝나지 않았으면(연결 실패·연결 회차 확정) 11/16의 사전 추첨·재추첨·내부 확정을 `409 RAFFLE_LIVE_EVENT_INCOMPLETE`로 막는다. 연결되지 않은 상태를 정상 통합 추첨으로 다루지 않는다.
- 후보는 연결된 각 회차의 판매 기간 안에 산 응모권만이다. 연결되지 않은 회차와 마감 이후 응모권, 탈퇴 회원 응모권은 넣지 않는다. 운영자(`ADMIN_READ_IDS`) 응모권은 기존처럼 제외한다.
- 응모권 한 장이 한 표다. 같은 응모 번호가 두 회차에 있어도 응모권 ID로 구분한다. 한 회원이 두 회차 응모권을 모두 가져도 행사 전체에서 한 번만 당첨된다.
- 후보 변경 검사(확정 시)도 두 회차 전체를 기준으로 한다.
- 잠금은 상태(`READY`·`RUNNING`·`PAUSED`·`COMPLETED`)와 Feature Flag에 관계없이 적용된다. 관리자 화면은 서버 메시지를 그대로 표시한다.
- 행사를 마칠 때는 `RaffleDrawingService.confirmLiveEventReview()`만 확정할 수 있다. HTTP로 노출하지 않으며 S3 행사 서비스가 호출한다. 운영 권한, 검토 중인 `drawId` 일치, 후보 변경 검사는 직접 확정과 같다. 같은 `drawId`로 다시 호출하면 기존 확정 결과를 반환한다(`alreadyFinalized=true`).
- 당첨 결과·알림·연락처는 행사 회차 주차(2026-11-16) 기준이다. 11/09 응모권만 산 당첨자도 `GET /api/v1/raffles/rounds/2026-11-16/result`와 알림, 연락처 제출을 같은 방식으로 쓴다.
- 확정 전에는 회원 결과가 `PENDING`이고 개인 알림·연락처 조회에 나타나지 않는다. 판매 종료 + 9시간(11/19 09:00 KST)이 지나도 같다.

## 배포 전후 DB 검증

`infra/app/verify-raffle-live-event-db.sh`는 SELECT만 실행한다. DEV는 앱 서버, 운영은 운영 DB 서버의 MySQL 컨테이너에서 실행한다. `pre`/`post`를 바꿔 실행한다.

```bash
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env -f infra/app/compose.dev.yaml exec -T mysql sh -s -- ontop_dev pre < infra/app/verify-raffle-live-event-db.sh
```

```bash
sudo docker compose --env-file /etc/ontop/prod-db/compose.env -f infra/prod-db/compose.yaml exec -T mysql sh -s -- ontop post < infra/app/verify-raffle-live-event-db.sh
```

1. **배포 전(`pre`)**
   - `v182_event_round_path`가 `EXPECTED` 또는 `ABSENT`여야 한다. `UNEXPECTED`면 배포를 보류하고 원인을 확인한다.
   - `v182_source_round_path`가 `LINKABLE`이어야 한다. `FINALIZED`(11/09 이미 확정)나 `ABSENT`면 배포를 보류하고 정책을 결정한다. `reviews`가 1 이상이면 11/09에 따로 만든 검토안이 있다는 뜻이다. 배포 후에는 확정할 수 없다.
   - 주차별 응모권 수(`tickets_in_window`)와 구매자 수를 기록해 둔다.
2. **배포 후(`post`)**: Flyway 182 `success=1`, `deadline_check`·`lock_check`·두 주차의 `link_check`·`picks_fk_check`·`late_ticket_check`·`not_finalized_check`가 모두 `PASS`여야 한다. `link_check`의 `FAIL: 연결 실패`는 통합 추첨이 막힌 상태다.
3. **API**: 로그인한 회원의 `GET /api/v1/raffles/current` 응답에서 `salesEndsAt`이 `2026-11-18T15:00:00Z`인지 확인한다.
4. **확정 잠금**: DEV에서만 확인한다. 판매 종료 후 11/16 사전 추첨을 만들고 관리자 화면에서 확정을 누르면 `RAFFLE_LIVE_EVENT_LOCKED`, 11/09 사전 추첨을 누르면 `RAFFLE_LIVE_EVENT_SOURCE_ROUND` 안내가 나와야 한다.

운영 적용은 11/19 00:00 KST 이전이어야 한다. 늦어지면 그 사이 구매한 응모권은 엽전이 차감됐지만 후보에서 빠진다(`late_ticket_check`). **배포 전까지 운영 관리자가 11/09 회차를 사전 추첨·확정하지 않도록 한다.**

## 범위 밖

- 닉네임 공개 고지는 FE 팀과 협의한다. hotfix 미적용 환경에서는 11/09 응모 번호가 11/16 주 화면에 보이지 않는다.
- 공개 화면에서 응모 번호를 보여 줄 때 두 회차의 같은 번호를 어떻게 구분할지는 S2/S4에서 정한다.
- DEV 11/09 회차는 이제 DEV 행사의 포함 회차다. 리허설 회차 계획은 S5에서 다시 정한다(`registration_source = 'DEV_MANUAL'`은 그때 사용).
- 행사 진행 상태·`drawId` 고정·비상 완료는 S3 범위다.
