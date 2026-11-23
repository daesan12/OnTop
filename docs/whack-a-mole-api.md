# 두더지 잡기 API 계약

> 2026-11-24: [공통 보상 정책](minigame-shared-budget.md)에 따라 미니게임 일일 획득 상한을 제거한다. 현재 dailyCap/dailyCoinCap=0은 무제한이며 누계가 1,000냥을 넘어도 전액 지급한다. 아래 이전 상한 설명과 예시보다 이 정책이 우선한다.

오락기 게임 고르기 창에서 고르는 1인 미니게임이다. Jira `S15P31B105-333`, 규칙 2는 `S15P31B105-340`, 규칙 3은 `S15P31B105-342`. 참가비 없이 실력으로 엽전을 번다.
서버가 시드로 90초 출현표를 정하고, 완료 때 같은 시드로 출현표를 다시 만들어 타격 기록을 처음부터 계산한다.
클라이언트 점수는 진행 중 표시용이며 최종 점수·지급은 서버 값이다. 공통 지갑·원장만 사용한다.

## 규칙 3 (2026-11-05 사용자 확정)

규칙 2(마구 누르기 방지)에서 '망치 하나'(80ms 안의 다른 키 무시)를 빼고, 키를 자판 가운데 줄 `S D F · J K L`로, 지급을 40점당 1냥으로 바꿨다.

| 항목 | 값 |
| --- | --- |
| 구멍 | 한 줄 아치 6개. 왼손 `S D F`(0~2), 오른손 `J K L`(3~5), 가운데가 뒤로 들어가고 F·J 사이가 조금 더 넓다. 마우스 클릭도 같은 구멍 |
| 한 판 | 90초 = 30초 × 3구간 |
| 구간 | 1구간 최대 동시 2 · 1.1초 · 연타 2~3회 / 2구간 2 · 0.95초 · 2~4회 / 3구간 3 · 0.8초 · 2~5회. 출현 간격 평균 656 · 472 · 360ms, 평균 약 45 · 56 · 78마리 |
| 머무는 시간 | 일반·치면 안 되는 친구는 구간 값, 금색은 그 55%, 연타는 `횟수 × 220 + 600`ms |
| 점수 | 일반 10, 금색 30, 연타 2회 20 · 3회 30 · 4회 45 · 5회 60, 치면 안 되는 친구 −20 |
| 콤보 | 두더지를 칠 때마다 +1(연타는 다 잡았을 때 +1). 10콤보 ×1.2, 20 ×1.5, 30 ×2(내림). 빈 구멍·치면 안 되는 친구를 치면 0 |
| 엽전 | 40점당 1냥(내림. 이미 정산한 판은 규칙 1 30점, 규칙 2 45점), 한 판 최대 없음, [미니게임 공통 하루 1000냥 상한](minigame-shared-budget.md)에 `MOLE_REWARD`로 합산 |
| 참가비 · 판 수 | 없음 · 제한 없음 |

판정 세부(서버 `MoleRules.score`, 화면 `features/mole/scoring.ts` 동일):

- 출현 후 60ms 안의 타격은 세지 않는다(올라오는 모션 대부분은 잡힌다). 같은 구멍 타격 간격이 60ms보다 짧으면 세지 않는다.
- 다른 구멍은 동시에 쳐도 모두 센다(규칙 2의 망치 하나 제한은 규칙 3에서 뺐다).
- 아무것도 없는 구멍을 치면 콤보가 0이 되고 2초 동안 모든 타격을 세지 않는다(기절).
  봐주는 경우: 150ms 안에 그 구멍에 두더지가 나오면 무시, 250ms 안에 들어간 두더지를 늦게 친 것은 콤보만 끊음, 잡은 뒤 250ms 안의 같은 구멍 잔타는 무시.
- 그냥 도망간 두더지는 콤보를 끊지 않는다.
- 시뮬레이션(보고 반응 후 손이 비면 치는 사람 모델, 규칙 1에서 약 45냥으로 맞춤) 보통 실력 평균: 규칙 3에서 약 44냥(서버 테스트 기준).
  옆 키를 같이 누르는 실수가 이제 세져 기절로 이어지므로, 규칙 2(45점당 약 49냥)보다 지급 비율을 올렸다. 초당 40번 마구 누르기는 5냥 미만.
- 판의 `rules_version`이 서버 규칙 버전과 다르면(배포 전에 시작한 판) 완료 때 `MOLE_ROUND_EXPIRED`로 보상 없이 닫는다.

## API

모든 요청은 인증된 활성 회원의 Access JWT를 사용하고 사용자 ID는 인증 Principal에서만 가져온다. 응답은 `Cache-Control: no-store`.

| 메서드 | 경로 | 본문 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/v1/minigames/whack-a-mole/status` | 없음 | 200 상태 |
| POST | `/api/v1/minigames/whack-a-mole/rounds` | 없음, `Idempotency-Key` 필수 | 201 출현표 |
| POST | `/api/v1/minigames/whack-a-mole/rounds/{roundId}/complete` | `{"hits":[{"hole":0,"at":812}]}` | 200 정산 |
| GET | `/api/v1/minigames/whack-a-mole/rankings?limit=20&offset=0` | 없음 | 200 랭킹 페이지 |

- 시작: 같은 키를 다시 보내면 같은 판을 돌려준다. 새 판을 열면 끝내지 않은 이전 판은 `EXPIRED`로 보상 없이 닫는다.
  출현표 `moles[]`는 `id · hole · kind(NORMAL|GOLD|RAPID|DECOY) · hits · appearAt · leaveAt`(판 시작 기준 ms)다.
  `targets[]`는 구멍 번호와 동일한 형식의 ID 두 개(`hole · ids[2]`)를 담는다. 화면과 점수 판정에는 기존 `moles[]`를 사용한다.
- 완료: 서버 시작 시각부터 90초가 지나야 받고(`MOLE_ROUND_NOT_FINISHED`), 120초가 넘으면 `MOLE_ROUND_EXPIRED`다.
  타격은 최대 1,200개. 이미 정산한 판은 같은 결과를 돌려주고 다시 지급하지 않는다.
  실제 표적 타격에는 판 ID 문자열에서 선택한 해당 구멍의 `targetId`를 선택적으로 첨부한다. 해당 판의 숨은 ID 타격은
  점수 계산에서 제외하고 정산 성공 뒤 `mole_honeypot_hit` 로그를 한 줄 남긴다. 보상·랭킹 기준은 기존과 같다.
- 정산 응답: `result(id · score · maxCombo · caught · calculatedReward · reward · settledAt) · todayEarned · dailyCap · bestScore`.
  `calculatedReward`는 40점당 1냥 값, `reward`는 하루 상한을 적용해 실제 지급한 값이다.
- 상태·정산의 `bestScore`는 랭킹과 같은 기준으로 현재 규칙(3)으로 정산한 판의 최고 점수다.
- 랭킹: 현재 규칙으로 정산한 판 중 회원별 최고 기록 하나를 고른다. 점수 내림차순 → 최대 콤보 내림차순. 두 값이 같으면
  공동 순위(`1, 1, 3`)이고 먼저 정산한 기록·판 ID 순으로 보인다. 탈퇴 회원과 이전 규칙 기록은 제외한다. `limit`는 1~100(기본 20),
  `offset`은 0~10,000(기본 0). 참가자 수·목록·`me`는 하나의 읽기 전용 스냅샷에서 읽는다.

```json
{"rulesVersion":3,"period":"ALL_TIME","updatedAt":"2026-11-10T03:02:00Z","totalParticipants":1,"offset":0,"limit":20,
 "items":[{"rank":1,"userId":"101","nickname":"테스트 회원","score":1380,"maxCombo":24,"caught":96,"completedAt":"2026-11-10T03:01:33Z"}],
 "me":{"rank":1,"userId":"101","nickname":"테스트 회원","score":1380,"maxCombo":24,"caught":96,"completedAt":"2026-11-10T03:01:33Z"},
 "hasMore":false}
```

| 상태 | 코드 |
| --- | --- |
| 400 | `MOLE_INVALID_REQUEST` (키·판 번호·타격 기록 형식·랭킹 페이지 범위) |
| 401 | `UNAUTHENTICATED` |
| 404 | `MOLE_ROUND_NOT_FOUND` |
| 409 | `WALLET_NOT_READY`, `MOLE_ROUND_NOT_FINISHED`, `MOLE_ROUND_EXPIRED` |
| 503 | `MOLE_UNAVAILABLE` (같은 요청으로 재시도) |

## 저장

관리자 화면의 판 중 타격 관측과 비교는 [두더지 운영 관측](mole-audit.md)을 따른다.

`db/minigame/V147__create_mole_rounds.sql`이 `mole_rounds`를 만든다. 시드와 `rules_version`으로 출현표를 다시 만들 수 있어
출현표 자체는 저장하지 않는다. `V149__mole_rules_v2_reward_rate.sql`과 `V150__mole_rules_v3_reward_rate.sql`이 정산 CHECK를 규칙 버전별 비율(1: 30, 2: 45, 3 이후: 40)로 맞춘다.
같은 회원의 시작·완료는 지갑 비관적 잠금으로 줄을 서고, 지급 원장 키는 `mole:reward:{roundId}`다.
`V166__add_mole_ranking_index.sql`은 랭킹과 공원 랭킹판 조회를 위한 `ix_mole_bests(rules_version, status, user_id, score, max_combo, settled_at)`를
추가한다(스피드 두더지 `ix_speed_mole_bests`와 같은 모양). 데이터는 바꾸지 않는다.

## 범위 밖

별도 게임기 위치(지금은 오락기 고르기 창의 세 번째 게임), 관전, 효과음은 후속 작업이다.
자동 입력에 대한 기존 반응 하한·연타 간격·로그 검증은 유지하며, 일일 재화 상한은 적용하지 않는다.
