# 더하기 빼기 아케이드 API 계약

붕어빵 가게 옆 오락기에서 엽전을 걸고 즐기는 1인 미니게임이다. Jira `S15P31B105-325`.
공원 맵을 바꾸지 않도록 게임기를 따로 두지 않고, 가위바위보 룰렛 게임기에서 E를 누르면 뜨는 게임 고르기 화면에서 고른다.
서버는 게임기 위치를 다루지 않으므로 고르기 화면은 FE만의 기능이며 두 게임의 `GET .../status`로 오늘 남은 판을 보여 준다.
서버가 세 릴의 칸과 지급액을 모두 정하고, 클라이언트는 받은 결과를 정지 버튼 연출로 공개만 한다.
기존 테이블 GameEngine·WS·붕어빵 세션으로 가장하지 않고 가위바위보 룰렛처럼 공통 지갑·원장만 사용한다.

## 규칙 (2026-11-03 사용자 확정)

| 항목 | 값 |
| --- | --- |
| 참가비 | 30냥. START에서 차감 |
| 하루 판 수 | 횟수 제한 없음. `dailyPlays: 0`은 무제한이며 `playedToday`는 KST 날짜별 누적 기록 |
| 숫자1 릴 | 16칸, 12시부터 시계방향 `7,0,3,1,5,2,0,4,1,2,8,0,3,1,6,2` |
| 연산자 릴 | 8칸 `+,-,+,-,+,-,+,-` |
| 숫자2 릴 | 16칸 `J,1,4,0,2,9,1,3,2,6,0,1,5,2,8,3` (`J`=JACKPOT, 응답 값 `-1`) |
| 지급 | `숫자1 ± 숫자2`가 1 이상이면 결과 × 10냥, 0 이하면 꽝 |
| JACKPOT | 숫자1이 7이면 연산자와 무관하게 500냥, 그 밖의 숫자면 꽝 |
| 정지 버튼 | 화면 연출. 1 → 2 → 3 순서, 누르면 0.2~1.4초 미끄러져 서버가 정한 칸에 선다. 5초 안에 누르지 않으면 자동 정지 |
| 이탈 | START에서 이미 정산되므로 연출 중에 닫아도 결과는 그대로 반영된다 |

칸마다 확률이 같다. 2,048가지 조합의 지급 합계는 73,120냥으로 한 판 평균 35.7냥, 회수율은 약 119%다.
JACKPOT 당첨은 1/256, 계산 최대 지급은 8 + 9 = 170냥이다. 배당은 보상이 아니므로
[미니게임 공통 하루 상한](minigame-shared-budget.md)에 합산하지 않는다.

## API

모든 요청은 인증된 활성 회원의 Access JWT를 사용하고 사용자 ID는 인증 Principal에서만 가져온다.
응답은 `Cache-Control: no-store`이며 성공 본문은 모두 같은 상태 형식이다.

| 메서드 | 경로 | 본문 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/v1/minigames/plus-minus/status` | 없음 | 200 |
| POST | `/api/v1/minigames/plus-minus/rounds` | 없음, `Idempotency-Key` 헤더 필수 | 201 |

같은 `Idempotency-Key`를 다시 보내면 같은 판을 돌려주고 다시 차감하지 않는다. 클라이언트는 POST 전에 키를
`sessionStorage`에 저장해 응답을 잃어도 같은 키로 재확인한다.

```json
{
  "serverNow": "2026-11-03T03:00:00Z", "availableBalance": 190, "playedToday": 1,
  "rules": { "fee": 30, "dailyPlays": 0, "firstReel": [7, 0], "operatorReel": ["+", "-"],
    "secondReel": [-1, 1], "pointPayout": 10, "jackpotFirst": 7, "jackpotPayout": 500 },
  "round": { "id": "7", "firstCell": 0, "operatorCell": 0, "secondCell": 12, "first": 7, "operator": "+",
    "second": 5, "result": 12, "outcome": "PAID", "payout": 120, "playedAt": "2026-11-03T03:00:00Z" }
}
```

`round`는 가장 최근 판이며 없으면 `null`이다. `outcome`은 `LOST`·`PAID`·`JACKPOT`, `result`는 JACKPOT 칸이면 `null`이다.

| 상태 | 코드 |
| --- | --- |
| 400 | `PLUS_MINUS_INVALID_REQUEST` (키 누락·형식 오류) |
| 401 | `UNAUTHENTICATED` |
| 409 | `WALLET_NOT_READY`, `INSUFFICIENT_COINS` |
| 503 | `PLUS_MINUS_UNAVAILABLE` (같은 키로 재시도) |

## 저장

`db/minigame/V143__create_plus_minus_rounds.sql`이 `plus_minus_rounds`를 만든다. 한 판은 생성 순간 정산이 끝나므로
진행 중 상태·마감·정리 작업이 없다. 같은 회원의 START는 지갑 비관적 잠금으로 줄을 서고, 판 행·참가비 원장
(`MINIGAME_ENTRY_FEE`, 키 `plus-minus:{userId}:{requestKey}`)·지급 원장(`PLUS_MINUS_PAYOUT`, 키
`plus-minus:payout:{roundId}`)을 한 트랜잭션에 쓴다. TINYINT 칸 컬럼은 엔티티에 `columnDefinition = "TINYINT"`를 둔다.

## 횟수 제한 해제 후 운영 확인 (MR !667)

`countPlays`는 `user_id`와 KST `play_date`로 집계하며, V143에
`ix_plus_minus_user_date (user_id, play_date)`가 정의되어 있다. 실제 DB 적용과 EXPLAIN은 미확인이다.
캐시는 트랜잭션 롤백·여러 서버의 집계 일관성 검토 없이 추가하지 않는다.

요청 키 멱등성과 지갑 잠금은 중복 결제를 막지만 호출 빈도를 제한하지 않는다.
`/api/v1/minigames/plus-minus/status` 및 `/rounds`에 적용된 사용자·IP별 호출 제한과
이상 거래 알림은 인프라·운영 담당자 확인이 필요하다. 전용 애플리케이션 레이트 리밋은 현재 없다.
일일 보상 상한이나 판 수 제한을 임의로 다시 도입하지 않으며, 운영 정책이 준비됐다고 보장하지 않는다.

## 후속 범위

주변 관전 방송과 효과음은 후속 작업이다. 오락기 3D 정면 판은 아직 가위바위보 룰렛 그림이다.
