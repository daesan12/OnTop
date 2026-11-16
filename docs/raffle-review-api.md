# 응모권 검토 추첨 API (S15P31B105-380)

응모권 판매가 끝난 회차만 관리자가 수동으로 추첨한다. 서버의 자동 확정 스케줄러는 사용하지 않는다. 조회 권한과 운영 권한은 각각 `ADMIN_IDS`, `ADMIN_OPERATION_IDS`를 따른다. 응답은 `Cache-Control: no-store`이다.

| 순서 | 요청 | 역할 |
| --- | --- | --- |
| 1 | `POST /api/v1/admin/raffles/rounds/{weekStart}/draws` | 현재 검토용 추첨 생성. 같은 요청을 다시 보내면 같은 `drawId` 반환 |
| 2 | `GET /api/v1/admin/raffles/rounds/{weekStart}/draws/current` | 저장된 후보·GM 제외 수·1/2/3등 슬롯 확인 |
| 3 (선택) | `POST /api/v1/admin/raffles/rounds/{weekStart}/draws/reroll` | `{ "expectedDrawId": 1, "reason": "사유" }`로 재추첨. 이전 시도와 후보는 보존 |
| 4 | `POST /api/v1/admin/raffles/rounds/{weekStart}/finalize` | `{ "drawId": 2 }`로 현재 검토한 시도만 최종 확정 |

`drawId`는 예시 값이며 실제 응답의 값을 사용한다. 오래된 시도를 확정하거나 재추첨하면 `409 RAFFLE_REVIEW_STALE`가 반환된다. 최종 확정 뒤에는 재추첨할 수 없고, 같은 `drawId`로 확정을 재요청하면 기존 결과를 반환한다. 후보 응모권이나 GM 제외 수가 추첨 이후 달라졌다면 확정을 거절한다. 발표 시각 전의 회원 결과는 `NOT_ANNOUNCED`이며, 발표 시각이 지나도 관리자가 아직 확정하지 않았다면 `PENDING`이다.

공개 추첨 행사 대상으로 등록된 회차(V182의 2026-11-16 회차)는 4단계 확정을 `409 RAFFLE_LIVE_EVENT_LOCKED`로 거부하고, 행사를 마칠 때 서버 내부 경로로만 확정한다. 자세한 내용은 [raffle-live-event.md](raffle-live-event.md)를 참조한다.

`GET .../draws/current`는 검토 중인 시도만 조회한다. 회차나 검토 중인 시도가 없으면 `404`, 이미 확정된 회차면 `409 RAFFLE_ALREADY_FINALIZED`를 반환한다. 확정 결과는 `GET /api/v1/admin/raffles/rounds/{weekStart}`에서 조회한다. 재추첨 사유가 공백이거나 500자를 넘으면 `400 RAFFLE_REROLL_REASON_REQUIRED`, 확정할 `drawId`가 양수가 아니면 `400 RAFFLE_INVALID_DRAW_ID`를 반환한다.

관리자 화면 S15P31B105-384는 사전 추첨·검토·재추첨·최종 확정의 네 단계를 연결한다. 확정 요청은 현재 검토 중인 `drawId`를 본문에 담고, 요청 전 최신 시도를 다시 조회한다. 요청 응답이 유실되면 저장된 시도 또는 확정 결과를 재조회해 중복 실행을 막는다.

**운영 2026-11-02 회차를 지금 확정하지 않는다.** 운영 env의 `RAFFLE_DRAW_ENABLED=false`를 유지하고, 관리자 화면 배포 및 DEV 검증 후 백업·회차·후보·GM 제외를 확인한 담당자만 수동 실행한다. 이번 API 배포 자체는 추첨을 시작하지 않는다.
