# 가위바위보 룰렛 API 계약

붕어빵 가게 옆 게임기에서 엽전을 걸고 즐기는 1인 미니게임이다. Jira `S15P31B105-306`.
서버가 기계 손·룰렛 칸·지급액을 모두 정하고, 클라이언트는 받은 상태를 연출만 한다.
기존 테이블 GameEngine·WS·붕어빵 세션으로 가장하지 않고 꼬치왕 이용권처럼 공통 지갑·원장만 사용한다.

## 규칙

| 항목 | 값 |
| --- | --- |
| 참가비 | 10 / 20 / 30냥. START에서 차감 |
| 하루 판 수 | KST 날짜 기준 15판. START에서 차감 |
| 기계 손 | 바위·가위·보 각 1/3. 입력 전에 정하고 SHA-256 커밋만 먼저 공개 |
| 비김 | 엽전 없이 같은 판에서 다시 대결 |
| 대결 제한 | 5초. 표시 마감 + 1.5초까지 받고, 이후 서버가 무작위 손을 대신 낸다 |
| 승리 후 선택 | 10초. 마감이 지나면 현재 배수로 자동 멈춤 |
| 도전 | 최대 2번. 배수 ×1.0 → 1차 성공 ×1.5 → 2차 성공 ×2.0. 실패하면 꽝. 2차 성공 시 바로 룰렛 |
| 룰렛 | 30칸, 12시부터 시계방향 `10,1,2,1,3,1,1,1,5,1,1,2,1,1,1,7,1,2,1,3,1,2,1,4,1,1,1,2,1,1` |
| 지급 | 참가비 × 칸 × 배수 (항상 정수, 최대 600냥) |
| 이탈 | 손이 공개된 판은 이탈해도 정리 작업이 같은 규칙으로 끝내고 결과를 적용한다 |

바로 멈추는 전략의 환급률은 약 101.7%, 도전 1번 76.3%, 2번 50.8%다. 배당은 보상이 아니므로
[미니게임 공통 하루 상한](minigame-shared-budget.md)에 합산하지 않는다.

## API

모든 요청은 인증된 활성 회원의 Access JWT를 사용하고 사용자 ID는 인증 Principal에서만 가져온다.
응답은 `Cache-Control: no-store`이며 성공 본문은 모두 같은 상태 형식이다.

| 메서드 | 경로 | 본문 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/v1/minigames/rps-roulette/status` | 없음 | 200 |
| POST | `/api/v1/minigames/rps-roulette/rounds` | `{"fee":20}` + `Idempotency-Key` | 201 |
| POST | `/api/v1/minigames/rps-roulette/rounds/{id}/hands` | `{"seq":1,"hand":"ROCK"}` | 200 |
| POST | `/api/v1/minigames/rps-roulette/rounds/{id}/challenge` | `{"seq":2}` | 200 |
| POST | `/api/v1/minigames/rps-roulette/rounds/{id}/stop` | `{"seq":2}` | 200 |

```json
{
  "serverNow": "2026-11-01T03:00:00Z",
  "availableBalance": 80,
  "playedToday": 1,
  "rules": {"fees": [10, 20, 30], "dailyPlays": 15, "multipliers": [1.0, 1.5, 2.0],
            "roulette": [10, 1, 2], "duelLimitMs": 5000, "decideLimitMs": 10000, "graceMs": 1500},
  "round": {
    "id": "17", "fee": 20, "phase": "DUEL", "seq": 1, "stakeLevel": 0, "multiplier": 1.0,
    "challenging": false, "duelNo": 1, "commitment": "<sha256>",
    "inputEndsAt": "2026-11-01T03:00:05Z", "deadlineAt": "2026-11-01T03:00:06.500Z",
    "lastDuel": null, "outcome": null, "rouletteCell": null, "rouletteValue": null,
    "payout": 0, "startedAt": "2026-11-01T03:00:00Z", "settledAt": null
  }
}
```

- `round`는 회원의 가장 최근 판이다. 진행 중이면 `phase`가 `DUEL`/`DECIDE`, 끝났으면 `SETTLED`와 `outcome`(`LOST`/`PAID`)이다.
- `commitment = SHA-256("rps-roulette|" + duelNo + "|" + machineHand + "|" + salt)`. 공개 후 `lastDuel`의
  `duelNo`·`machineHand`·`salt`로 직전 커밋을 다시 계산할 수 있다. 공개 전 기계 손과 salt는 응답에 없다.
- `seq`는 화면이 본 판 순번이다. 지난 순번(응답 유실 후 재전송, 마감 처리로 앞서간 판)은 다시 적용하지 않고
  현재 상태를 200으로 돌려준다. 클라이언트는 응답의 `round`로 화면을 맞춘다.
- 타이머는 `serverNow`로 보정한 `inputEndsAt`까지 표시한다. 0초가 되면 결과를 정하지 않고 `deadlineAt` 뒤 상태를 다시 읽는다.

| 상태 | 코드 |
| --- | --- |
| 400 | `RPS_INVALID_REQUEST`: 잘못된 키·참가비·손·순번·본문 |
| 401/403 | 기존 인증·회원·출처 정책 |
| 404 | `RPS_ROUND_NOT_FOUND`: 본인의 판이 아님 |
| 409 | `WALLET_NOT_READY` / `INSUFFICIENT_COINS` / `RPS_DAILY_LIMIT` / `RPS_ROUND_IN_PROGRESS` / `RPS_INVALID_PHASE` / `IDEMPOTENCY_KEY_CONFLICT` |
| 503 | `RPS_UNAVAILABLE`: 서비스 미설정·DB/트랜잭션 오류. 같은 요청으로 다시 확인한다 |

## 지갑·멱등성·마감 처리

`game/rpsroulette/service/RpsRouletteService`는 **지갑 → 판** 순서로 비관적 잠금한다.
START는 같은 READ_COMMITTED 트랜잭션에서 기존 요청 키 조회 → 진행 중 판 확인 → 15판 확인 → 사용 가능 잔액
(`balance - reserved`) 확인 → 차감 → `MINIGAME_ENTRY_FEE`(키 `rps-roulette:<회원>:<요청 키>`) → 판 생성을 커밋한다.
룰렛 지급은 `RPS_ROULETTE_PAYOUT`(키 `rps-roulette:payout:<판 ID>`)이며 원장 키가 유일해 중복 지급되지 않는다.

`rps_roulette_rounds.active_user_id`의 유일 제약으로 회원당 진행 중 판은 하나다. 1초마다 도는 정리 작업과 모든
요청은 마감이 지난 판을 먼저 끝낸다. 대결은 무작위 손, 선택은 자동 멈춤이다.

## DB

`db/minigame/V136__create_rps_roulette_rounds.sql`. V135(할리갈리)가 dev에 병합·적용된 뒤 병합한다.
Flyway `outOfOrder`가 꺼져 있어 V136이 먼저 적용된 DB에는 V135를 적용할 수 없다.
MySQL 검증은 매번 만든 loopback 전용 `ontop_rps_test_` DB에서만 실행하고 개발용 로컬 DB에는 적용하지 않는다.

## 범위 밖

공원 맵(`server-map.json`·mapVersion)은 바꾸지 않는다. 게임기는 화면용 3D 모델과 FE 접근 판정만 두며, 충돌·시설 점유와
주변 관전 방송은 위치가 확정된 뒤 별도 작업으로 맵 변경과 함께 진행한다.

## 검증

- `RpsRouletteRulesTests`: 칸 구성, 승패, 지급액, 커밋
- `RpsRouletteServiceTests`: START 차감, 같은 키, 꽝·비김·지급·2차 도전, 마감 자동 처리, 정리 작업, 지난 순번, 하루 제한, 잔액
- `RpsRouletteHttpTests`: 인증, 키·본문 검증, 오류 코드, no-store, CORS 사전요청
- `RpsRouletteMySqlTests` (`mysqlTest`, `TEST_RPS_ROULETTE_DB_URL`): V136, 동시 START, 진행 중 판 유일, 원장 롤백
