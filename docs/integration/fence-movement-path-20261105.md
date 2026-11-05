# 울타리 이동과 짧은 착지·재점프 보정 수정

- 브랜치: `fix/jumpmap-overlap-prewarm`, 기존 MR !376에 누적. 머지 보류.
- 기준: `origin/dev@86ab0c00f947c77a4f1de0b061b51afd5f67cf74`. 공유 이력을 보존해 반영했으며 충돌 없음. 마지막 통합은 운영 상태 주입의 부분 컨텍스트 보정 1건이며 FE·맵·물리 소스 변경은 없었다.
- 공통 경로: FE `network/localMovementPrediction.ts`, `network/predictionPhysics.ts`; BE `world/movement/ClientPositionValidator.java`, `WorldPhysics.java`.
- DB/Flyway 변경 없음. 사용자 공유 현황 V150까지 유지. 별도 gameCode나 게임 엔진 변경 없음.

## 문제와 수정

60ms 보고 사이에 울타리의 둥근 끝을 따라 내려오거나 착지 직후 재점프하면 두 끝점을 잇는 선만으로 실제 경로를 설명하지 못했다. 서버가 이를 COLLISION/JUMP_HEIGHT/JUMP_REQUIRED로 거절하고 마지막 승인 위치와 새 세대로 되돌렸다. 이때 이동·달리기 상태도 꺼졌다.

기존 WORLD_POSITION에 최대 64개의 선택 경로를 추가한다. 실제 점프 발동을 기록하므로 키를 먼저 누르고 착지 후 발동하는 점프도 포함한다. 서버가 확인한 중간 지지면만 비행 종료/새 이륙 근거가 된다. 직선은 합치되 지지 상태 변화·점프 발동·굽은 구간은 보존한다. 끝점/중간점의 벽·바닥·천장 충돌과 공중 점프 높이 검증을 유지한다.

서버는 경로 전체의 이동 예산 및 수직 한도를 유지하고 각 점에 클라이언트 시각을 부여하지 않는다. 중간 실패 시 모든 검증 상태를 원자적으로 복구한다. 최종 승인 한 번만 기존 월드/점프맵 진행·보상 경로에 전달한다. 경로를 생략한 구 FE는 기존 방식으로 동작하며 새 FE는 BE 반영 후 배포한다. 64개를 넘는 정체 경로의 끝점 fallback에는 기존 접촉 보정이 남을 수 있다.

## 독립 실행과 검증

frontend의 기존 의존성을 사용한다. `FENCE_MOVEMENT_DIR`는 저장소 밖 QA 폴더로 지정한다.

```powershell
$env:FENCE_MOVEMENT_DIR='<QA 경로>'
.\node_modules\.bin\vitest.cmd run tests/unit/fenceMovementPaths.test.ts
# 같은 환경변수를 유지한 backend 디렉터리에서:
.\gradlew.bat test --tests com.ssafy.ontop.world.movement.FenceMovementPathTests --tests com.ssafy.ontop.world.movement.PositionPathTests --console=plain
# frontend 브라우저 시나리오(5309 포트):
$env:QA_ARTIFACT_DIR='<QA 경로>'
node node_modules/@playwright/test/cli.js test --config playwright.fence-movement.config.ts
```

224개 조건은 이전 진단과 같은 울타리 4곳의 걷기/달리기, 단일 넘기·위 이동·옆/끝 내려오기, 반복 점프와 60ms 보고 위상 차이를 포함한다. 두 울타리 끝 달리기는 30/60/144Hz 및 60/90/120ms 보고(지연 모사)로 확인한다. 실제 송신 주기는 변경하지 않는다. FE 실제 물리/경로 수집기에서 출력한 JSON을 Java/Bullet 검증기에 재생한다.

최종 재검증에서 224개 조건·9,674건 승인, 보정 0건이었다. 경로 크기 평균 2.22개·최대 10개였다. 관련 BE 361개 통과·7개 opt-in 건너뜀, FE 101개 통과·2개 opt-in 건너뜀, 테스트 포함 타입 검사와 공원 빌드, diff 검사를 통과했다. Playwright의 실제 DOM 입력·Rapier·카메라·렌더러에서 울타리 끝 달리기와 착지 점프, 기존 첫/반복 겹침·재질 해제·컨텍스트 복원 2개 시나리오가 통과했다. 브라우저의 전송은 echo mock이며 Java 검증과 실제 인증 WebSocket은 별도로 확인한다.

벽 관통·30회 미세 침투·바닥/천장 통과·왕복 거리 속도 우회·중간점으로 나눈 과도한 낙하·공중 점프 반복·좌표 불일치·시각/접지 주입·64개 초과·세대/순번/활동 권한 및 실패 상태 복구를 회귀 대상으로 둔다. 최종 테스트 결과는 MR에도 기록한다.

운영 서버 동시 접속·WAN 지연 분포·모바일/헤드셋·공원 전체 게임 흐름은 검수하지 않았다. 로컬 물리·인증 소켓·브라우저 검증과 운영 통합 완료를 구분한다. 머지는 사용자 지시 전까지 보류하고 소스 브랜치를 보존한다.
