# 미니게임·운동기구 엽전 수급 조정

기준: `origin/dev@d16def39`. 작업 위치는 `OnTop/minigame-reward-rebalance-20261103`, 브랜치는
`feat/minigame-reward-rebalance-20261103`이다. 기존 worktree와 미커밋 변경은 보존했다.

## 지급 정책

| 활동 | 보상 | KST 하루 상한 |
| --- | --- | --- |
| 붕어빵 `BUNGEOPPANG` | 서버 검증 점수 5점마다 1냥, 나머지 내림 | 미니게임 합산 500냥 |
| 돌탑 점프맵 | 구간별 5·10·20·30·40·60·85냥, 완주 합계 250냥 | 미니게임 합산 500냥 |
| 운동기구 `FITNESS` | 서버가 확인한 실제 연속 이용 60초마다 1냥 | 운동만 별도 300냥 |

점프맵은 후반 구간과 완주 보상의 비중을 높였다. 다른 미니게임 수입이 없으면 완주 두 번으로
500냥을 받는다. 잔여 공통 예산이 적으면 해당 구간에서 남은 금액만 지급하며, 게임은 계속할 수 있다.
점프맵의 코스·판정·랭킹 버전과 맵 좌표는 유지하여 기존 기록을 보존한다.
점프맵 JDBC 원장 시각도 JPA와 같은 UTC로 기록한다. JVM이 한국 시간이어도 늦은 저녁 지급이
다음날 수입으로 잘못 밀려 일일 상한 집계에서 빠지지 않도록 한다. 기존 원장 시각은 일괄 수정하지 않는다.

붕어빵 신규 설정은 `v4-20261103.1`, `v5-20261103.1`이다. 이미 시작한 v4/v5 판은 저장된 설정을
재접속·납품·완료에 그대로 사용한다. 결과 화면의 환산 안내도 해당 판의 규칙을 사용한다.

운동기구는 가속된 공원 시계 대신 서버 단조 시계의 60초를 사용한다. 하차·접속 종료·기구 변경 시
미완료 구간은 기존처럼 초기화한다. 완료 구간의 저장 실패는 같은 멱등 키로 재시도한다.
`FITNESS_REWARD` 원장의 KST 날짜 범위를 지갑 잠금 이후 집계해 동시 요청도 300냥까지만 지급한다.
운영 배포 당일 이미 지급된 운동 보상도 이 원장 집계에 포함한다.

## 경로와 연결 계약

- 붕어빵: BE `minigame/**`, FE `features/bungeoppang/**`.
- 점프맵: BE `world/jumpmap/**`, FE `features/jumpmap/**`, 기존 코스 원본 `layout-preview/jumpCourse.ts`.
- 운동: BE `world/fitness/**`, 기존 시설 lease·하차·지갑 새로고침 흐름 재사용.
- 공통 변경: `WalletTransactionRepository.java`에 운동 보상의 날짜 범위 집계 메서드 추가,
  `ParkInteractionHint.tsx` 및 설명서 `manual/catalog.ts`의 지급 안내 갱신.
- 점프맵 FE 수신 검증은 한 판 최대 250냥을 허용한다. 기존 메시지 필드와 HTTP 경로는 유지한다.
  공통 일일 상한·지갑 잔액은 서버 확정값을 따르며 클라이언트가 보상을 직접 더하지 않는다.
- 게임 시작·입력·관전·종료·기권·재접속 계약의 필드나 공통 게임 엔진은 변경하지 않는다.

## Flyway와 배포 순서

`backend/src/main/resources/db/minigame/V141__increase_jumpmap_run_reward_cap.sql`은
`jump_runs.ck_jump_runs_coins`를 `0..100`에서 `0..250`으로 바꾼다. 기존 V131은 수정하지 않는다.
사용자 지정 V141을 이 작업에 우선 사용한다. 로컬 `skewer-service-hall`에 있던 꼬치용 V141은
사용자가 별도 번호로 옮기기로 했으며 이 작업에서 그 파일을 수정하지 않았다.

번호 지정 전 확인한 최신 원격·관련 원격 브랜치의 최대 번호는 V140이고, 열린 MR은 주사위 UI
작업 1개였다. 로컬 worktree의 꼬치용 V141 외 V142 이상 파일은 발견하지 못했다. 미공유 팀 예약과
운영 DB 적용 이력은 확인하지 않았다. 머지 전에 꼬치 작업의 번호 재배정과 원격 중복을 다시 확인한다.

점프맵을 활성화하는 DB 프로필은 기존처럼 `db/migration,db/minigame`을 함께 적용해야 한다.
운영의 실제 `DB_MIGRATION_LOCATIONS`에도 `db/minigame`이 포함되어 V141 적용이 끝난 후
새 보상 서버를 시작해야 한다. 스키마가 100냥 제약인 상태에서 새 보상을 지급하면 DB가 거절한다.
DB 초기화·Flyway repair·기존 migration 수정은 하지 않는다.

## 독립 검증 방법

BE 작업 디렉터리는 `backend`다.

```powershell
.\gradlew.bat test --tests 'com.ssafy.ontop.world.fitness.*Tests' --tests 'com.ssafy.ontop.minigame.*Tests' --tests 'com.ssafy.ontop.world.jumpmap.*Tests'
.\gradlew.bat mysqlTest --tests '*JumpmapMySqlTests' --tests '*FitnessRewardMySqlTests'
```

MySQL 테스트는 loopback 전용 DB만 허용한다. 운동은 `TEST_DB_URL/USERNAME/PASSWORD`,
점프맵은 `TEST_JUMPMAP_DB_URL/USERNAME/PASSWORD`를 사용한다. 운영 DB를 지정하지 않는다.

FE 작업 디렉터리는 `frontend`다. 기존 `pnpm test -- tests/unit/jumpmap.test.ts tests/unit/bungeoppang`,
`pnpm typecheck`, `pnpm build`, `pnpm jumpmap:check`를 사용한다.
최신 맵 UI 검증은 `playwright.jumpmap.config.ts`의 5214 포트에서 운동 진입·하차와 점프맵 완료를,
`playwright.park.config.ts`의 5202 포트에서 붕어빵 결과를 확인한다. 두 설정은 `--strictPort`를 사용한다.

브라우저의 API·소켓은 테스트 대역이며 실제 엽전은 지급하지 않는다. 별도 MySQL 테스트는 실제
JPA/JDBC·트랜잭션·원장을 사용한다. 운영 서버의 다인 플레이와 배포 후 실제 계정의 잔액은 별도 확인 대상이다.

## 검증 기록

- 관련 BE 단위·계약 테스트 245개, FE 보상·붕어빵 테스트 202개 통과.
- FE 타입 검사·프로덕션 빌드·최신 맵 확인·점프맵 전달본 checksum 확인 통과.
- 전용 MySQL 8.4 기존 DB에서 V141 순차 적용 및 점프맵·운동 20개 테스트 통과.
- 신규 DB의 V141 전체 적용 확인. 250냥 허용·251냥 거부, 완주 두 번 500냥, 부분 지급,
  동시 요청, 재시도·롤백, KST 자정 및 늦은 저녁의 날짜 집계를 검증했다.
- 최신 맵 Edge 브라우저: 운동 진입→새 안내→중복 보상 수신→하차,
  점프맵 250냥 완료 및 합계 500냥 표시 확인. 운동·점프맵은 1920×1080와 740×900,
  붕어빵은 1920×1080·1366×768·390×844에서 결과와 새/기존 환산 안내를 확인했다.
- 브라우저에서 빈 화면·Vite 오류 오버레이·가로 넘침 없이 대상 조작을 확인했다.
  기존 THREE.Clock 폐기 예정 안내·셰이더 정밀도 경고와 빌드의 큰 chunk 경고는 남아 있다.
- Jenkins http://localhost:8081/job/ontop-dev/ 는 연결 거부로 이번 작업 SHA의 실행 여부와 성공을
  확인하지 못했다. 운영 반영·MR 머지·브랜치 삭제는 수행하지 않는다.
