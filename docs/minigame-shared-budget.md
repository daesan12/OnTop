# 미니게임 공통 일일 보상

2026-10-31 사용자 피드백. 점프맵·붕어빵 굽기·온탑 꼬치왕과 이후 추가되는 미니게임의 지급 보상을 **회원별 한국 시간 하루 합계 1000냥**으로 제한한다. 게임별 100냥 한도는 사용하지 않는다.

## 지급 계약

- 점프맵의 구간별 보상과 붕어빵의 점수 환산 방식은 각 게임의 지급 규칙을 따른다. 온탑 꼬치왕 1인 모드는 기존 10냥 이용료·보상 미지급 계약을 따르고, 협동 모드의 점수 보상은 공통 예산을 사용한다.
- `MinigameRewardBudget`이 정책과 합산 조회를 공유한다. 지갑을 먼저 비관적 잠금하고, 같은 트랜잭션에서 실제 지급된 원장을 읽은 뒤 `min(max(0, 계산액), max(0, 1000 - 오늘 합계))`만 지급한다. 정산의 기존 영수증·멱등 키·지갑·원장 경로는 유지한다.
- 합산 대상은 `MINIGAME_REWARD`, `JUMP_GATE_REWARD`, `SKEWER_REWARD`, [두더지 잡기](whack-a-mole-api.md)의 `MOLE_REWARD`, 무료 돌탑 대난투 순위 보상의 `GAME_RANK_REWARD`에 기록된 양수 지급이다. 붕어빵·줄넘기·틀린 그림 찾기는 공통 `MINIGAME_REWARD`를 사용하고, 스피드 두더지는 `MOLE_REWARD`를 사용한다. 신규 미니게임은 공통 `MINIGAME_REWARD`를 사용하거나 지급 타입을 이 집계 정책과 회귀 테스트에 함께 등록한다.
- 날짜는 **실제 지급 시각의 KST 날짜**, 범위는 `[00:00, 다음 날 00:00)`이다. 자정 이후 재시도되는 지급은 지급한 날의 예산을 사용한다. 과거 영수증 재조회는 재지급하지 않는다.
- **예외 (2026-11-01 사용자 확정):** 참가비를 거는 게임의 배당은 보상이 아니므로 상한에서 뺀다. 상한 때문에 이미 건 판의 배당을 깎으면 조작이 되기 때문이다. [가위바위보 룰렛](rps-roulette-api.md)의 `RPS_ROULETTE_PAYOUT`(하루 15판)과 [더하기 빼기 아케이드](plus-minus-api.md)의 `PLUS_MINUS_PAYOUT`(하루 10판, 2026-11-03 사용자 확정)이 해당하며, 대신 판 수로 참여 횟수를 제한한다. 참가비(`MINIGAME_ENTRY_FEE`)도 합산하지 않는다.
- `todayEarned`는 모든 미니게임 합계, `dailyCap`은 1000이다. 클라이언트 예상액은 실제 잔액을 바꾸지 않는다. 한도 이후에도 플레이·기록은 가능하고 추가 보상만 0이다.

## 집계 범위 확인

| 원장 타입 | 집계 기준 |
| --- | --- |
| `MINIGAME_REWARD`, `JUMP_GATE_REWARD`, `SKEWER_REWARD`, `MOLE_REWARD`, `GAME_RANK_REWARD` | 한국 날짜 범위 내 회원별 양수 지급 합산 |
| `RPS_ROULETTE_PAYOUT`, `PLUS_MINUS_PAYOUT` | 참가비 배당의 기존 예외 적용 |
| `FITNESS_REWARD` | 운동 보상의 별도 하루 500냥 한도 적용 |
| `GACHA_PAYOUT` | 유료 뽑기 당첨·중복 환급의 별도 정책 적용 |
| `GAME_SETTLEMENT`, `GAME_TIE_BONUS` | 보드게임 정산·무승부 보너스 |
| `SIGNUP_BONUS`, `ADMIN_BULK_GRANT`, `NOTIFICATION_REWARD` | 가입·관리자 지급·관리자 알림 보상 |
| `MOBILITY_RENTAL_FEE`, `MINIGAME_ENTRY_FEE`, 구매·예약·해제 원장 | 지급 보상 합산에서 제외 |

사격정 MySQL 회귀 테스트는 각 지급 타입 995냥 이후 5냥만 지급되는지, 다섯 타입의 혼합 합계, 별도 정책의 양수 원장, 차감·0원·다른 회원·한국 시간 자정 경계를 검증한다. 기존 동시 정산·재시도 검증도 유지한다.

## 저장 및 변경 범위

기존 `wallet_transactions`를 재사용하므로 신규 Flyway는 없다. 적용된 V131은 수정하지 않는다. V131의 `jump_daily_earnings`는 이전 게임별 카운터로 보존하되 더 이상 지급 판정·쓰기·상태 조회에 사용하지 않는다. `jump_runs.coins_granted <= 100`은 한 판의 총 구간 보상이 100냥이므로 유지한다.

BE 공통 변경은 `MinigameRepository`, `MinigameService`, 붕어빵 Rules/Spec, `JdbcJumpmapStore`, `WalletTransaction`의 지급 시각 전달이다. 엔진이나 클라이언트에서 잔액을 직접 수정하지 않는다. FE는 기존 붕어빵·점프맵 상태/결과에 공통 합계를 표시한다.

전용 MySQL 8.4 테스트는 실제 붕어빵 완료와 점프맵 정산을 동시에 실행해 잔여 2냥만 지급되는지, 영수증 재전송·롤백·KST 자정·이미 지급된 다른 게임 보상 합산을 확인한다. 운영 DB 초기화·repair는 수행하지 않는다.
