# 응모권 공개 추첨 행사 — S1 마감 보정·확정 잠금

기준 문서: `OnTop_Raffle_Live_Event_Plan_v1.7` (B안: 행사 전에는 `REVIEW`까지만, 행사를 마칠 때 서버가 확정).

## V182가 하는 일

`V182__register_raffle_live_event_20261116.sql`은 2026-11-16 회차에만 적용된다.

| 항목 | 내용 |
| --- | --- |
| 판매 마감 | `raffle_rounds.sales_ends_at`을 `2026-11-18 15:00:00` UTC(11/19 00:00 KST)로 당긴다. 11/18 23:59:59.999 KST까지 구매할 수 있다. |
| 행이 없을 때 | 판매 시작 `2026-11-16 00:00:00` UTC(09:00 KST), 종료 `2026-11-18 15:00:00` UTC로 회차를 만든다. |
| 행이 있을 때 | 기존 주간 종료값 `2026-11-22 15:00:00` UTC일 때만 바꾼다. 다른 값이면 덮어쓰지 않는다. 마이그레이션은 실패하지 않으므로 결과는 아래 검증 스크립트로 판정한다. |
| 행사 대상 등록 | `raffle_live_events`에 `READY`/`MIGRATION`으로 등록한다. 마감값과 관계없이 등록한다. |
| 시간대 | 파일 첫 줄에서 세션을 `+00:00`으로 고정한다. 리터럴은 모두 UTC다. |

## 확정 잠금

- `POST /api/v1/admin/raffles/rounds/{weekStart}/finalize`는 `raffle_live_events`에 등록된 회차를 `409 RAFFLE_LIVE_EVENT_LOCKED`로 거부한다. 상태(`READY`·`RUNNING`·`PAUSED`·`COMPLETED`)와 Feature Flag에 관계없이 적용된다. 관리자 화면은 서버 메시지를 그대로 표시한다.
- 사전 추첨(`.../draws`)과 재추첨(`.../draws/reroll`)은 그대로 허용한다. 행사 진행 중 차단은 S3에서 추가한다.
- 행사를 마칠 때는 `RaffleDrawingService.confirmLiveEventReview()`만 확정할 수 있다. HTTP로 노출하지 않으며 S3 행사 서비스가 호출한다. 운영 권한, 검토 중인 `drawId` 일치, 후보 변경 검사는 직접 확정과 같다. 등록되지 않은 회차는 `409 RAFFLE_LIVE_EVENT_NOT_REGISTERED`다.
- 같은 `drawId`로 다시 호출하면 기존 확정 결과를 반환한다(`alreadyFinalized=true`). 당첨자를 다시 만들지 않는다.
- 확정 전에는 기존 회원 결과가 `PENDING`이고 개인 알림·연락처 조회에 나타나지 않는다. 판매 종료 + 9시간(11/19 09:00 KST)이 지나도 같다.

## 배포 전후 DB 검증

`infra/app/verify-raffle-live-event-db.sh`는 SELECT만 실행한다. DEV는 앱 서버, 운영은 운영 DB 서버의 MySQL 컨테이너에서 실행한다.

```bash
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env -f infra/app/compose.dev.yaml exec -T mysql sh -s -- ontop_dev pre < infra/app/verify-raffle-live-event-db.sh
```

```bash
sudo docker compose --env-file /etc/ontop/prod-db/compose.env -f infra/prod-db/compose.yaml exec -T mysql sh -s -- ontop post < infra/app/verify-raffle-live-event-db.sh
```

1. **배포 전(`pre`)**: `v182_path`가 `EXPECTED` 또는 `ABSENT`인지 확인한다. `UNEXPECTED`면 배포를 보류하고 값이 바뀐 원인을 확인한다. `tickets_at_or_after_deadline`은 0이어야 한다.
2. **배포 후(`post`)**: `flyway_schema_history`의 181 `success=1`, `deadline_check`·`lock_check`·`late_ticket_check`·`not_finalized_check`가 모두 `PASS`인지 확인한다.
3. **API**: 로그인한 회원의 `GET /api/v1/raffles/current` 응답에서 `salesEndsAt`이 `2026-11-18T15:00:00Z`인지 확인한다.
4. **확정 잠금**: 판매 종료 후 사전 추첨을 만든 뒤 관리자 화면에서 확정을 누르면 `RAFFLE_LIVE_EVENT_LOCKED` 안내가 나와야 한다. 운영에서는 이 확인을 하지 않는다(DEV에서만).

운영 적용은 11/19 00:00 KST 이전이어야 한다. 늦어지면 그 사이 구매한 응모권은 엽전이 차감됐지만 후보에서 빠진다(`late_ticket_check`).

## 범위 밖

- 복권방 안내 문구(일요일 마감·월요일 발표)와 닉네임 공개 고지는 FE 팀과 협의한다. 마이그레이션 후 복권방 회차 일정은 DB 값을 따라 `11/18 23:59` 마감을 표시하지만, 발표 시각은 여전히 `종료 + 9시간`으로 계산한다.
- DEV 11/09 리허설 회차 등록(`registration_source = 'DEV_MANUAL'`)과 확정은 S5에서 승인 후 진행한다.
- 행사 진행 상태·`drawId` 고정·비상 완료는 S3 범위다.
