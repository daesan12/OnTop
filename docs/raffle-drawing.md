# 주간 응모권 추첨 (S15P31B105-353)

## 회차와 시각

- 판매는 KST 월요일 09:00부터 다음 월요일 00:00 직전까지다. 종료 시각은 제외한다.
- 마감된 `raffle_rounds`는 운영자가 직접 사전 추첨한다. 서버 재시작만으로 추첨하거나 확정하지 않는다.
- `RAFFLE_DRAW_FIRST_WEEK`의 기본값은 `2026-11-02`다. 이 날짜보다 앞선 회차를 소급 추첨하지 않는다. 새 환경의 첫 행사 주차가 다르면 배포 전에 KST 월요일 날짜로 설정한다.
- 추첨은 마감 이후 가능하지만 회원에게는 다음 월요일 09:00 KST부터 결과를 공개한다.
- 회차가 존재하지 않는 주는 빈 추첨을 만들지 않는다. 구매나 이번 주 조회로 생성된 판매 회차만 처리한다.

## 후보와 상품

- 해당 회차에 실제 저장된 `raffle_tickets` 중 `[sales_starts_at, sales_ends_at)`에 구매하고 탈퇴하지 않은 회원의 응모권만 후보로 사용한다.
- 관리자 조회 권한 `ontop.admin.read-ids`에 포함된 회원은 GM으로 보고 응모권 전부를 제외한다.
- 각 응모권의 당첨 기회는 동일하다. `SecureRandom`으로 1등부터 차례로 뽑고, 당첨된 회원의 나머지 응모권은 뒤 등수에서 제외한다.
- 1등 1개(황올+크리스피+콜라), 2등 2개(싸이버거 세트), 3등 5개(메가커피 아메리카노) 슬롯을 회차에 기록한다. 이후 상품 설정이 바뀌어도 이전 회차의 상품명은 유지된다.
- 후보 회원이 부족하면 남은 슬롯을 비워 두고 `vacantPrizeCount`로 수량을 반환한다. 당첨자를 중복 생성하지 않는다.
- 판매 종료 후 사전 추첨을 시작하기 전에 기존 판매 회차 행을 잠근다. 구매도 같은 행을 잠그므로 마감 경계의 구매와 추첨이 직렬화된다. 이벤트 회차도 잠가 동시 요청을 한 결과로 수렴시킨다.

## API와 운영

| 요청 | 권한 | 응답 |
| --- | --- | --- |
| `GET /api/v1/raffles/rounds/{weekStart}/result` | 로그인 회원 | 발표 전 `NOT_ANNOUNCED`, 추첨 지연 시 `PENDING`, 발표 후 본인의 `SELECTED`·`NOT_SELECTED` |
| `GET /api/v1/admin/raffles/rounds/{weekStart}` | 관리자 조회 | 등수·상품·당첨 회원 ID·응모권, 빈 슬롯 수, 확정 시 후보 응모권·제외 GM 응모권 수 |
| `POST /api/v1/admin/raffles/rounds/{weekStart}/draws` | 관리자 운영 | 검토용 결과 생성; 재요청 시 같은 시도 반환 |
| `GET /api/v1/admin/raffles/rounds/{weekStart}/draws/current` | 관리자 조회 | 현재 검토 중인 결과와 `drawId` |
| `POST /api/v1/admin/raffles/rounds/{weekStart}/draws/reroll` | 관리자 운영 | `expectedDrawId`와 `reason`을 받아 이전 시도를 보존하고 재추첨 |
| `POST /api/v1/admin/raffles/rounds/{weekStart}/finalize` | 관리자 운영 | 본문 `{ "drawId": 1 }`로 검토한 결과만 최종 확정 |

`weekStart`는 KST 월요일 날짜(`YYYY-MM-DD`)다. 모든 응답은 `Cache-Control: no-store`를 사용한다. 회원 API는 다른 회원의 결과를 반환하지 않는다. 연락처 제출과 관리자 연락처 조회는 후속 작업이다.

`RAFFLE_ENABLED=true`와 DB 프로필이 있어야 추첨 서비스와 기존 구매 서비스가 함께 켜진다. 자동 확정 스케줄러는 제거했다. 이전 배포 버전이 실행 중인 운영 환경에서는 `RAFFLE_DRAW_ENABLED=false`를 유지한다. 배포 전 DEV·운영의 관리자 ID와 첫 행사 주차를 확인한다. 사전 추첨의 예상치 못한 실패와 최종 확정 성공은 `event_finalization_attempts`에 기록한다. 사전 추첨과 재추첨 후보 이력은 `event_raffle_draws`와 `event_raffle_draw_picks`에 남는다. 자세한 호출 순서와 운영 보류 조건은 [raffle-review-api.md](raffle-review-api.md)를 참조한다.
