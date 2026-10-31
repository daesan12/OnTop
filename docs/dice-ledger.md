# 주사위 장부 · DICE_LEDGER

S15P31B105-293. 요트 계열 규칙을 사용하는 2~4인 테이블 게임이다. 이름·칸 이름은 원작과 구분한다. 2026-10-30 사용자 확정 규칙을 적용한다.

- 주사위 5개, 한 차례 최대 3번 굴림. 굴림 사이에 보관/해제는 자유다.
- 12칸 × 12라운드. 칸마다 한 번만 기록하고, 조건이 맞지 않으면 0점이다.
- 선공은 서버가 무작위로 정한다.

## 점수표

| 칸 (code) | 조건 | 점수 |
| --- | --- | --- |
| 1~6 (ONES~SIXES) | 없음 | 해당 눈의 합 |
| 소계 보너스 | 위 6칸 합 ≥ 63 | +35 |
| 자유 (CHOICE) | 없음 | 5개 합 |
| 포카드 (FOUR_OF_A_KIND) | 같은 눈 4개 이상 | **같은 눈 4개의 합만** (6·6·6·6·5 → 24) |
| 풀하우스 (FULL_HOUSE) | 3개+2개, **같은 눈 5개도 인정** | 5개 합 |
| 스몰 스트레이트 (SMALL_STRAIGHT) | 연속 4개 | 15 |
| 라지 스트레이트 (LARGE_STRAIGHT) | 연속 5개 | 30 |
| 장원 (FIVE_OF_A_KIND) | 같은 눈 5개 | 50 |

이론상 최대 319점(위 105 + 보너스 35 + 30 + 24 + 30 + 15 + 30 + 50). 서버 계산은 `DiceLedgerScoring`, FE 미리보기는 `frontend/src/game/ledger/scoring.ts`이며 확정 점수는 서버 값이다.

## 입력

기존 GAME_ACTION_SEND payload `{gameId,actionId,expectedVersion,input}`을 사용한다.

| input | 조건 |
| --- | --- |
| `{"kind":"roll","keepIds":[]}` | 차례 첫 굴림. 첫 굴림의 keepIds는 비어 있어야 한다 |
| `{"kind":"roll","keepIds":[0,3]}` | 남은 굴림이 있을 때. 0~4 중복 없는 ID만 보관하고 나머지를 다시 굴린다. 이전 보관도 빼면 다시 굴린다 |
| `{"kind":"score","category":"FULL_HOUSE"}` | 1번 이상 굴린 뒤 본인의 빈 칸. 기록하면 차례가 넘어간다 |

필드 추가·점수/눈 주입·차례 외 입력·기권자 입력은 거절한다(INVALID_ACTION / NOT_YOUR_TURN / STALE_VERSION / NOT_ACTIVE / GAME_FINISHED).

## 상태

GAME_STATE.publicState이며 privateState는 항상 `{}`다. 복구(GAME_CONNECTION_STATE.state)는 원카드·다리와 같이 `{publicState, privateState:{}}`로 감싼다.

| 필드 | 설명 |
| --- | --- |
| gameCode/status | DICE_LEDGER, PLAYING/FINISHED |
| turnTimeLimitMs/maxRolls | 30000/3 |
| upperBonusThreshold/upperBonus | 63/35 |
| categories | 위 12칸 code 순서 |
| turnUserId/turnId/round | 현재 차례 ID/차례 번호(1부터)/현재 차례 참가자의 라운드(1~12). 종료 시 null |
| rollCount/rollId | 이번 차례 굴림 수/전체 굴림 수(연출용) |
| dice | `[{id:0,value:1,held:false},...]` 5개. 이번 차례 첫 굴림 전 [] |
| players | 좌석순 `{userId, forfeited, scores:{ONES:null\|int,...}, upperSubtotal, upperBonus, total}` |
| lastScored | 최근 기록 `{userId, category, points, auto, turnId}`. auto=true는 시간 초과 자동 기록 |
| lastEvent | START, ROLL, SCORE, TURN_TIMEOUT, PLAYER_LEFT |
| winnerUserIds/endReason/endedAt | 승자 배열/ALL_CATEGORIES_FILLED 또는 LAST_PLAYER_STANDING/종료 시각 |

## 시간·기권·승패

**한 차례 30초**. 재굴림·재접속으로 연장하지 않는다. 마감 시 서버가 처리한다.

1. 아직 굴리지 않았으면 서버가 1번 굴린다.
2. 빈 칸 중 현재 주사위로 점수가 가장 높은 칸에 기록한다. 같은 점수면 점수표 앞 칸이다.
3. 차례를 넘긴다.

지연된 타이머는 원래 마감 기준으로 지난 차례를 순서대로 처리한다.

- **기권**(수동 기권·재접속 유예 만료): 그 참가자는 차례에서 빠지고 장부는 남는다. 한 명만 남으면 LAST_PLAYER_STANDING으로 그 사람이 승리한다.
- **완성**: 남은 참가자 모두 12칸을 채우면 ALL_CATEGORIES_FILLED다. 최고 총점자가 모두 승자다.
- **정산**: 공동 승리는 기존 `GameSettlementCalculation`을 따른다. 판돈이 나누어 떨어지지 않으면 모자란 만큼 서버 보너스로 채워 공동 승자에게 같은 금액을 지급한다. 기권자는 FORFEIT(참가비 차감)다.

## 관전자 훈수 핑

[관전 채팅·핑](websocket-api/10-game-spectator-events.md)의 권한·수신 범위·ACK·중복 eventId 규칙을 그대로 쓴다.

- 승인 관전자만 보낸다. 플레이어는 GAME_SPECTATOR_ACCESS_DENIED다.
- TTL은 2초다.
- 사용자별 1초 간격과 경기별 상한은 오목 핑과 공유한다. 초과 코드도 `OMOK_SPECTATOR_PING_TOO_FREQUENT`다.
- 핑은 표시일 뿐이며 GAME_ACTION·GAME_STATE를 만들지 않는다.

```json
{"requestId":"ledger-ping-1","type":"DICE_LEDGER_SPECTATOR_PING_SEND","payload":{"gameId":"41","eventId":"ee46b20f-e2b9-40ee-9a73-7a86c59e65a2","basedOnVersion":8,"category":"FULL_HOUSE"}}
{"requestId":"ledger-ping-2","type":"DICE_LEDGER_SPECTATOR_PING_SEND","payload":{"gameId":"41","eventId":"0f1c6d4e-3b2a-4c1d-9e8f-7a6b5c4d3e2f","basedOnVersion":8,"dieId":3}}
```

payload는 `category`(위 12칸 code) 또는 `dieId`(0~4) **중 하나만** 가진다. 둘 다 있거나 둘 다 없으면 INVALID_PAYLOAD다.

전달 이벤트 `DICE_LEDGER_SPECTATOR_PING`의 payload는 `{gameId,eventId,senderUserId,basedOnVersion,category,dieId,sentAt,expiresAt,serverNow}`이다. 쓰지 않은 대상 필드는 null이다.

| code | 조건 |
| --- | --- |
| DICE_LEDGER_SPECTATOR_PING_STALE_VERSION | basedOnVersion이 관전자에게 마지막으로 전달한 버전과 다름 |
| GAME_SPECTATOR_UNSUPPORTED_GAME | 관전 중 경기가 주사위 장부가 아님. 장부 경기에 오목 핑을 보낸 경우도 같다 |

## 서버 연결과 DB

- **활성화**: local/dev 또는 운영 `prod,db`에서 `ontop.games.ledger.enabled=true`(`GAME_LEDGER_ENABLED=true`)로 켠다. 기본은 꺼짐이며 실제 시작에는 `GAME_START_ENABLED=true`도 필요하다.
- **생성**: `DiceLedgerEngine.create(gameId,tableId,players)`는 예약 커밋 확인 뒤 서버 내부에서만 호출한다.
- **DB**: 기존 `game_sessions`·`game_participants`를 그대로 쓴다. `V130__allow_dice_ledger_game_sessions.sql`은 참가 인원 CHECK에 `DICE_LEDGER`(2~4인)만 추가하며, 기존 행·컬럼·다른 제약은 바꾸지 않는다. 기록 조회 `gameCode` 필터에도 `DICE_LEDGER`를 추가했다.

## 검증

backend:

```powershell
.\gradlew.bat test --tests '*DiceLedger*'
```

| 테스트 | 범위 |
| --- | --- |
| DiceLedgerScoringTests | 전 칸 점수·보너스 경계 |
| DiceLedgerEngineTests | 3회 굴림·보관 해제·중복 기록 거절, 12칸 완성 승패·동점 공동 승리, 30초 자동 기록·지연 타이머, 기권 건너뛰기·최후 1인 |
| DiceLedgerFlowTests | 실제 소켓의 굴림·기록·관전 핑 전달·거절 코드·자동 기록 |

frontend: `tests/unit/ledger.test.ts`.

인증·시작은 테스트 대역, 시간은 제어 시계다. 실제 로그인·차감·지급/DB·운영 적용 검증은 아니다.
