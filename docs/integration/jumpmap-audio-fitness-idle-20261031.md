# 점프맵 오디오 감쇠·운동기구 방치 보상

## 최신 dev 통합 확인 (2026-11-01)

기존 변경을 Git stash에 보존하고 최신 `origin/dev@5df6447c`를 반영했다. 최신 점프맵 시간제한·보상·즉시 재시도 정책 및 공통 지갑 원장 변경을 자동 병합했고 코드 충돌은 없다. 새 migration은 없으며 V133을 포함한 기존 파일을 수정하지 않았다.

관련 FE 단위 테스트 8파일 61개, FE/테스트 타입 검사, 서버 테스트 20개(FitnessRewardService 7, PreparedParkSocket 3, WorldFacility/Flow 10), 별도 loopback MySQL 8.4 DB `ontop_users80_test_fitness_20261101_feedback`의 동시 지급·롤백 2개가 통과했다. 새 테스트 DB의 Flyway 초기 적용도 함께 검증했다. 계정/권한은 생성하지 않았다.

대상 브라우저 전체 12개 중 11개가 최초 통과했고, 오디오 전환 완료를 즉시 읽던 검사를 poll로 보정한 뒤 감쇠/복원·발판 음원·운동 보상 3개가 모두 통과했다. 이전에 기준 코드에서도 실패했던 서버 미연결 길 안내 검사는 최신 dev에서는 통과했다. 아래 과거 실패와 커밋 보류 설명은 최초 구현 이력이며 현재 사용자 승인 범위는 커밋·푸시·MR·머지·브랜치 삭제까지다. 운영 서버 다인 플레이 및 서버 재시작을 넘는 미확정 보상 복원은 보장하지 않는다.

## 작업 기준과 범위

- 브랜치: `feat/jumpmap-audio-fitness-idle-20261031`
- 작업 위치: `OnTop/jumpmap-audio-fitness-idle`
- 기준: fetch로 확인한 `origin/dev@d8a571f0`. 통합 검증 전 재확인에서도 동일했다.
- 최신 맵: `c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`.
- 점프맵: `features/jumpmap/`의 기존 컨트롤러와 음원 사용. 맵·발판 좌표·음원 파일은 변경하지 않았다.
- 운동 보상: 기존 공원 시설 기능의 확장이며 신규 테이블 게임/gameCode를 추가하지 않는다. BE 로직은 `world/fitness/`에 격리했다.
- V133은 사용자가 전달한 팀원 사용 번호로 제외했다. 기존 지갑·원장만 사용하므로 Flyway 신규 파일/예약 번호가 없고 적용된 migration도 변경하지 않았다.
- 기존 작업 위치의 미커밋 변경을 복사·초기화하지 않았다. 커밋·푸시·MR·병합·배포는 수행하지 않았다.

## 사용자 동작

점프맵의 서버 확인된 도전이 진행 중이면 BGM 출력 진폭을 기존 설정의 25%, 일반 효과음을 20%로 감쇠한다. 발판·게이트 소리는 별도 출력으로 기존 음량을 유지한다. 두 효과음 출력 모두 사용자의 효과음 볼륨·음소거 설정을 따른다. 도전 종료, 맵 불일치, 연결 종료, 컨트롤러 해제 시 복원하며 저장된 설정을 덮지 않는다.

운동기구는 서버가 승인한 실제 탑승 상태를 유지하면 게임 6시간마다 1냥을 지급한다. 현재 서버 하루 1,800,000ms의 1/4이므로 현실 450초(7분 30초)이다. 별도 입력 없이 운동 애니메이션을 유지하는 기존 동작을 사용한다. 하차·채널 이탈·접속 종료는 다음 구간까지의 시간을 초기화한다. 완료한 구간은 하차 후에도 지급을 재시도한다. 벤치·망원경·비회원·목업·DB 없는 실행에는 보상이 없다. 일일 상한은 추가하지 않았다.

## 공통 연결과 FE/BE 계약

- `TableHub`: 기존 시설 시작/종료 확정 지점에 보상 서비스 호출만 연결했다. 인증된 accountId와 서버가 만든 leaseId를 사용한다. 시설 접근·점유·위치·하차 검증은 기존 경로를 유지한다.
- `WORLD_FACILITY_CATALOG`: 선택적 `fitnessRewardsEnabled` boolean 추가. 구버전 서버의 필드 누락은 false로 처리한다. true인 서버에서만 운동기구 이용 안내에 지급 조건을 표시한다.
- `FITNESS_REWARD`: 해당 회원 연결에만 `{ userId, receipt: "fitness:<lease UUID>:<완료구간 번호>" }`를 보낸다. 클라이언트 지급 요청은 없다.
- `settlementRefresh`: 본인 수신·영수증 형식·중복을 확인한 뒤 기존 권위 있는 지갑 GET을 무효화한다. FE가 잔액에 1을 더하지 않는다. 연결 복구 후에는 기존 지갑 조회가 확정 잔액을 읽는다.
- `WalletTransaction.fitnessReward`: 기존 원장에 `FITNESS_REWARD`, `balance_delta=1`, `reserved_delta=0`으로 기록한다. 기존 지갑 비관적 잠금 뒤 멱등 키를 검사하고 잔액과 원장을 같은 트랜잭션에서 확정한다.
- 공원 잠금에서는 시간 추적만 한다. DB 작업은 별도 보상 스레드에서 실행하며 실패한 구간은 같은 키로 재시도한다. 클라이언트 시간이나 위치 보고로 지급 시간을 계산하지 않는다.

공통 변경 파일: `TableHub.java`, `WalletTransaction.java`, `audio/bgm.ts`, `network/facilityClient.ts`, `features/facilities/protocol.ts`, `features/interactions/ParkInteractionHint.tsx`, `features/interactions/interactions.css`, `features/wallet/settlementRefresh.ts`. CSS는 900px 이하 화면에서 `[data-fitness-id]` 안내를 채팅 위로 올리는 규칙만 추가했다. 공통 게임 엔진·예약·정산·맵·카메라·의존성은 변경하지 않았다.

## 독립 실행과 검증

작업 폴더의 `frontend`에서 실행한다. `node_modules`는 같은 lockfile을 가진 기존 설치의 junction을 사용했다.

```powershell
node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5214 --strictPort
node node_modules/@playwright/test/cli.js test --config playwright.jumpmap.config.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --project tsconfig.tests.json --noEmit
```

5214는 이번 작업의 Playwright/개발 검증 포트이며 테스트 명령이 서버를 시작한다. 브라우저의 `/park` 검증은 최신 생성 맵을 사용한 WebSocket/HTTP 대역이다. 실제 지급과 인증 서버를 연결한 사용자 플레이는 아니다. Browser 플러그인이 없어 기존 Playwright/Edge를 사용했다. 화면 크기는 1920×1080, 740×900이다.

BE의 독립 보상 테스트는 `backend`에서 `gradlew.bat test --tests '*FitnessRewardServiceTests'`로 실행한다. 단조 시계를 사용해 449/450/900초 경계, 중복 시작, 하차 후 새 탑승, 재시도와 하차 경쟁, 비대상 시설, DB 미연결을 검증한다. 최신 생성물의 실제 소켓 테스트는 `TEST_GENERATED_MAP_DIR=<작업폴더>/frontend/generated/park`를 지정하고 `PreparedParkSocketTests`를 실행한다.

MySQL 검증은 전용 loopback DB `ontop_users80_test_fitness_20261031`과 기존 로컬 테스트 계정으로 실행했다. 공유 DB의 사용자·권한을 추가하지 않았다. `FitnessRewardMySqlTests`는 같은 구간 8건 동시 요청, 다른 구간 지급, 예약잔액 보존, 원장 실패 시 전체 롤백을 검증한다. DB 접속 정보는 저장하지 않았다.

검증 결과:

| 항목 | 결과 |
| --- | --- |
| FE 타입 검사·테스트 타입 검사·공원 통합 빌드 | 통과 |
| 오디오·점프맵·시설·운동·지갑 단위 테스트 | 9파일 71개 통과 |
| 보상 서비스·최신 맵 소켓/전달 테스트 | 11개 통과 |
| 기존 WorldFacilityTests·WorldFacilityFlowTests | 통과 |
| MySQL 8.4 운동 지급 동시성·롤백 | 2개 통과 |
| 맵·점프 코스 생성물 정합성 | 통과, 갱신된 맵 파일 없음 |
| 브라우저 페이지 식별·비어 있지 않음·Vite 오류 없음 | 통과 |
| 운동 탑승·안내·영수증 중복 방지·이동키 하차 | 통과 |
| 점프맵 감쇠·종료/맵 불일치 복원·설정 보존 | 통과 |
| 승인된 8개 발판 음원·독립 볼륨·음소거 | 전용 발판 출력으로 검사 대상 갱신 후 통과 |
| 기존 점프맵 진행·정산·완료·낙하·좁은 화면 | 통과 |
| 서버 미연결 시 지도 길 안내선 표시 | 기존 실패, 아래 참조 |

최종 대상 브라우저 재검증은 운동기구(데스크톱·740px), 점프맵 감쇠/복원, 승인된 8개 음원/음소거 3개 시나리오 모두 통과했다. 개발 서버는 테스트 종료 시 정리했다. Browser 플러그인을 설치하면 후속 검증을 앱 내 브라우저에서 진행할 수 있다.

점프맵 전체 브라우저 검증에서 `missing backend keeps the park usable, hides unsupported course and still exposes directions`의 `.navigation-map-route` 표시 검사가 실패했다. 동일 커밋의 수정 없는 `frontend-jumpmap-selected-sfx`에서도 같은 실패가 재현됐다. 이번 기능 변경으로 생긴 회귀로 분류하지 않았으며 길 안내 코드는 수정하지 않았다. 전체 e2e 통과로 보고하지 않는다.

## 제한과 통합 상태

- 독립 보상 로직, 최신 맵 실제 WebSocket 연결, 실제 MySQL 지갑 지급을 각각 검증했다. 브라우저의 운동기구 진입 → 안내/지갑 갱신 → 하차 및 점프맵 시작 → 진행 → 종료 → 음량 복원을 대역 서버로 검증한다.
- 서버 재시작을 넘는 운동 시간·아직 DB에 확정되지 않은 지급 대기 구간의 복원은 보장하지 않는다. 확정된 잔액과 원장은 DB에 보존된다. 오프라인 보상은 없다.
- 운영 서버 연결, 배포 후 다인 플레이, 전체 게임 회귀는 수행하지 않았다.
- 기존 Three.Clock 사용 중단 경고·GPU 셰이더 정밀도 경고·빌드 큰 청크 경고가 관측됐다. 변경 기능의 React/Vite 오류는 관측되지 않았다.
