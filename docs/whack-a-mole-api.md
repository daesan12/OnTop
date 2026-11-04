# 두더지 잡기 API 계약

오락기 게임 고르기 창에서 고르는 1인 미니게임이다. Jira `S15P31B105-333`. 참가비 없이 실력으로 엽전을 번다.
서버가 시드로 90초 출현표를 정하고, 완료 때 같은 시드로 출현표를 다시 만들어 타격 기록을 처음부터 계산한다.
클라이언트 점수는 진행 중 표시용이며 최종 점수·지급은 서버 값이다. 공통 지갑·원장만 사용한다.

## 규칙 (2026-11-04 사용자 확정)

| 항목 | 값 |
| --- | --- |
| 구멍 | 2줄 × 4칸. 윗줄 `Q W E R`(0~3), 아랫줄 `U I O P`(4~7, 반 칸 오른쪽). 마우스 클릭도 같은 구멍 |
| 한 판 | 90초 = 30초 × 3구간 |
| 구간 | 1구간 최대 동시 2 · 0.9초 · 연타 2~3회 / 2구간 3 · 0.75초 · 2~4회 / 3구간 4 · 0.6초 · 2~5회. 평균 36 · 50 · 65마리 |
| 점수 | 일반 10, 금색 30(일반의 절반만 머묾), 연타 2회 20 · 3회 30 · 4회 45 · 5회 60, 치면 안 되는 친구 −20 |
| 콤보 | 두더지를 칠 때마다 +1(연타는 다 잡았을 때 +1). 10콤보 ×1.2, 20 ×1.5, 30 ×2(내림). 빈 구멍·치면 안 되는 친구를 치면 0 |
| 엽전 | 30점당 1냥(내림), 한 판 최대 없음, [미니게임 공통 하루 500냥 상한](minigame-shared-budget.md)에 `MOLE_REWARD`로 합산 |
| 참가비 · 판 수 | 없음 · 제한 없음 |

판정 세부(서버 `MoleRules.score`, 화면 `features/mole/scoring.ts` 동일):

- 출현 후 100ms 안의 타격은 세지 않는다. 같은 구멍 타격 간격이 60ms보다 짧으면 세지 않는다.
- 두더지를 잡은 뒤 250ms 안의 같은 구멍 잔타는 빈 곳 타격으로 보지 않는다. 그냥 도망간 두더지는 콤보를 끊지 않는다.
- 보통 실력(1·2·3구간 85·70·55% 적중, 가끔 헛치기) 시뮬레이션 평균 약 46냥, 초보 약 26냥, 숙련 약 89냥.

## API

모든 요청은 인증된 활성 회원의 Access JWT를 사용하고 사용자 ID는 인증 Principal에서만 가져온다. 응답은 `Cache-Control: no-store`.

| 메서드 | 경로 | 본문 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/v1/minigames/whack-a-mole/status` | 없음 | 200 상태 |
| POST | `/api/v1/minigames/whack-a-mole/rounds` | 없음, `Idempotency-Key` 필수 | 201 출현표 |
| POST | `/api/v1/minigames/whack-a-mole/rounds/{roundId}/complete` | `{"hits":[{"hole":0,"at":812}]}` | 200 정산 |

- 시작: 같은 키를 다시 보내면 같은 판을 돌려준다. 새 판을 열면 끝내지 않은 이전 판은 `EXPIRED`로 보상 없이 닫는다.
  출현표 `moles[]`는 `id · hole · kind(NORMAL|GOLD|RAPID|DECOY) · hits · appearAt · leaveAt`(판 시작 기준 ms)다.
- 완료: 서버 시작 시각부터 90초가 지나야 받고(`MOLE_ROUND_NOT_FINISHED`), 120초가 넘으면 `MOLE_ROUND_EXPIRED`다.
  타격은 최대 1,200개. 이미 정산한 판은 같은 결과를 돌려주고 다시 지급하지 않는다.
- 정산 응답: `result(id · score · maxCombo · caught · calculatedReward · reward · settledAt) · todayEarned · dailyCap · bestScore`.
  `calculatedReward`는 30점당 1냥 값, `reward`는 하루 상한을 적용해 실제 지급한 값이다.

| 상태 | 코드 |
| --- | --- |
| 400 | `MOLE_INVALID_REQUEST` (키·판 번호·타격 기록 형식) |
| 401 | `UNAUTHENTICATED` |
| 404 | `MOLE_ROUND_NOT_FOUND` |
| 409 | `WALLET_NOT_READY`, `MOLE_ROUND_NOT_FINISHED`, `MOLE_ROUND_EXPIRED` |
| 503 | `MOLE_UNAVAILABLE` (같은 요청으로 재시도) |

## 저장

`db/minigame/V147__create_mole_rounds.sql`이 `mole_rounds`를 만든다. 시드와 `rules_version`으로 출현표를 다시 만들 수 있어
출현표 자체는 저장하지 않는다. 같은 회원의 시작·완료는 지갑 비관적 잠금으로 줄을 서고, 지급 원장 키는 `mole:reward:{roundId}`다.

## 범위 밖

별도 게임기 위치(지금은 오락기 고르기 창의 세 번째 게임), 관전, 효과음, 랭킹은 후속 작업이다.
자동 입력 프로그램은 반응 하한·연타 간격 검사로 대부분 거르고, 남는 위험은 하루 500냥 상한이 막는다.
