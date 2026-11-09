# 주차별 미니게임상 운영 API (S15P31B105-381)

## 범위

- 기존 2026-11-02 붕어빵·점프맵 회차와 API는 유지한다. 이 회차의 결과를 새 설정 테이블에 이관하거나 다시 확정하지 않는다.
- 2026-11-09 이후 주차에는 관리자가 게임, KST 행사 기간, 발표 시각, 상품 표시 이름을 명시적으로 설정한다. 새 회차는 자동으로 생성되거나 확정되지 않는다.
- 상품은 외부 기프티콘이다. 이 API는 당첨 기록과 상품 이름만 저장하며 기프티콘을 발송하지 않는다. 실제 전달 확인은 별도 지급 완료 흐름에서 다룬다.
- 기존 V163의 `event_minigame_configs`와 V153의 회차·상품 슬롯·당첨자·확정 시도 테이블을 사용한다. 새 Flyway 마이그레이션은 없다.

## 지원 게임과 랭킹 규칙

| gameCode | rankingRuleVersion | 검증 근거 | 정렬 |
| --- | --- | --- | --- |
| `BUNGEOPPANG` | `v5-120000ms` | 완료 세션, `VERIFIED` 정산, V5 결과와 120초 기록 | 점수 높은 순, 최대 콤보 높은 순, 먼저 달성한 순 |
| `JUMPMAP` | `v3-park180-jump-v1` | `FINISH`된 정상 서버 기록, V3 규칙과 코스, 모든 게이트 통과 | 소요 시간 짧은 순, 먼저 달성한 순 |

각 회원의 행사 기간 내 최고 기록 하나만 후보로 삼는다. 삭제된 회원은 SQL에서 제외하고 GM은 서버 관리자 조회 권한 목록을 기준으로 제외한다. 동일한 수치와 부가 점수에서는 서버가 확정한 기록 시각이 빠른 사람이 우선이다. 그 시각도 같으면 기록 ID로 결정해 반복 조회 결과를 안정적으로 유지한다. 현재 지원 게임 외의 `MG_*` 코드는 V163 스키마에서 예약되어 있으나 검증 랭킹 어댑터가 구현될 때까지 API에서 설정·노출·확정할 수 없다.

## 운영 순서

1. 주차별 게임과 상품이 확정되면 운영 권한 관리자가 `PUT /api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}`에 기간과 규칙을 등록한다. `weekStart`는 KST 월요일이다. 기간은 해당 주차 안에 있어야 한다. 새 회차 등록은 기록 마감 전에만 가능하다. 기존 설정은 행사 시작 전까지만 변경할 수 있고 확정 후에는 변경할 수 없다.
   등록 가능한 코드와 정확한 규칙 버전은 `GET /api/v1/admin/events/minigames/supported-games`에서 조회한다.
2. `GET /api/v1/admin/events/minigames/rounds/{weekStart}/games`는 활성화된, 서버가 지원하는 게임만 반환한다. 관리자 화면의 드롭다운은 이 응답을 사용한다.
3. `GET /api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}/ranking`으로 후보 수, GM 제외 수, 상위 100명의 서버 기록 ID와 점수를 확인한다. 마감 후 5분이 지나기 전에는 `PROVISIONAL`, 이후에는 `READY`다.
4. 관리자가 검토한 후보 수·GM 제외 수·1위 기록 ID를 `POST /api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}/finalize`에 보낸다. 확정 시 서버가 순위를 다시 계산해 값이 달라졌으면 `409 EVENT_RANKING_CHANGED`를 반환한다. 후보가 없으면 기록 ID는 `null`이고 공석으로 확정한다.
5. 같은 회차의 중복 요청은 저장된 당첨자를 그대로 반환한다. 확정된 결과는 이후 기록이나 설정 변경으로 바뀌지 않는다. 회원은 발표 시각 이후 `GET /api/v1/events/minigames/rounds/{weekStart}/games/{gameCode}/result`에서 본인 결과를 볼 수 있다.

`PUT` 본문 예시(값은 **예시일 뿐**이며, 실제 2026-11-09 게임·상품이 결정되기 전에는 호출하지 않는다):

```json
{
  "startsAt": "2026-11-09T00:00:00Z",
  "endsAt": "2026-11-15T15:00:00Z",
  "announcesAt": "2026-11-16T00:00:00Z",
  "displayName": "붕어빵",
  "rankingRuleVersion": "v5-120000ms",
  "enabled": true,
  "prizeName": "외부 지급 기프티콘"
}
```

`POST /finalize` 본문은 직전 순위 조회의 값을 그대로 넣는다:

```json
{"candidateCount": 3, "excludedGmCount": 1, "expectedSourceRecordId": "42"}
```

관리자 GET에는 `ADMIN_READ`, 설정·확정에는 `ADMIN_OPERATION` 권한이 필요하다. 응답은 `Cache-Control: no-store`다. `MINIGAME_AWARD_ENABLED=true`가 활성화되어 있어야 하며 기존 `MINIGAME_AWARD_WEEK` 환경변수는 신규 회차를 선택하는 용도로 쓰지 않는다. 기존 자동 스케줄러는 2026-11-02 레거시 회차만 대상으로 한다. 신규 주차는 수동 확정만 한다.
