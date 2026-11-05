# 전송 지연 시 이동 경로 상한 처리

- 작업 브랜치 `fix/jumpmap-overlap-prewarm`, 기존 MR !376에 누적, 머지는 보류한다.
- 통합 기준 `origin/dev@8e971321e2afe8a70e15ef556ce0f6bc301fe1c4`. 스킨·카메라·게임·지갑 표시 변경을 공유 이력 보존 방식으로 병합했다. Git 충돌은 없었고 공통 `Avatars.tsx`는 자동 병합됐다. 새 스킨 연결과 기존 반투명 자원 수명을 함께 유지한다.
- 이번 수정의 공통 런타임 파일은 FE `network/localMovementPrediction.ts`다. BE 런타임/메시지 형식/검증 한도·게임 규칙·정산/보상·맵을 변경하지 않는다. DB 변경은 없다. 최신 원격에 이미 포함된 V151·V152는 그대로 가져왔으며 신규 번호를 예약하거나 migration을 만들지 않았다.

## 동작

64점을 넘은 뒤 경로 전체를 버리고 끝점만 보고하면, 정상 곡선 경로나 중간 착지를 잃어 서버가 마지막 승인 위치로 되돌릴 수 있었다. 이제 64점에 도달하면 다음 물리 단계를 실행하기 전에 추가 예측을 잠깐 보류한다. 보관한 모든 점과 현재 실제 물리 위치를 유지한다. 송신 재개 시 그 경로를 그대로 보내고, 다음 프레임부터 누르고 있는 이동 방향으로 재개한다. 보류 중 지난 시간을 몰아서 실행하지 않는다.

점 수가 적게 압축되는 직선도 미전송 물리 시간 100ms를 상한으로 둬, 긴 전송 콜백 지연이 기존 서버 이동 예산을 넘는 큰 한 번의 이동으로 바뀌지 않게 한다. 원래 60ms 송신 주기와 서버의 64점·수평 거리·수직 한도·벽/바닥/천장 충돌 검증은 유지한다. 예측을 진행하지 않은 보고도 실제 점프가 없음을 나타내는 현재 위치 한 점을 보낸다. 일반 ACK가 새 로컬 위치를 reset하지 않는 기존 정책을 유지한다.

실제 연결 유실·서버 보고 만료·검증 실패의 안전 복구는 유지한다. 정체 중에는 로컬 캐릭터가 잠시 서 있을 수 있다. 운영 WAN에서 모든 종류의 장애를 무중단 처리한다는 뜻은 아니다.

## 재현 및 검증

frontend에서 저장소 밖 QA 경로를 지정한다.

```powershell
$env:FENCE_MOVEMENT_DIR='<QA 경로>'
$env:FENCE_BACKPRESSURE_DIR=$env:FENCE_MOVEMENT_DIR
.\node_modules\.bin\vitest.cmd run tests/unit/fenceMovementPaths.test.ts tests/unit/clientPositionPrediction.test.ts
# 같은 환경변수를 유지한 backend 디렉터리에서:
.\gradlew.bat test --tests com.ssafy.ontop.world.movement.FenceMovementPathTests --tests com.ssafy.ontop.world.movement.PositionPathTests --tests com.ssafy.ontop.world.movement.ContactSkinTests --console=plain
# frontend의 실제 DOM·물리·렌더러 검증(5309 포트):
$env:QA_ARTIFACT_DIR='<QA 경로>'
node node_modules/@playwright/test/cli.js test --config playwright.fence-movement.config.ts
```

- 기존 224개 조건: 9,674건 승인, 보정 0건, 경로 최대 11점.
- 250/500/1,000ms 보고 지연과 64점 강제 보존을 포함한 추가 89개 조건: 1,149건 승인, 보정 0건, 최대 64점. 서버 64점 제한을 완화하지 않았다.
- 64점 강제 조건은 압축 힌트만 번갈아 표시해 모든 점을 보존하도록 했으며 실제 Rapier 충돌/점프 물리와 서버 지지면 판정은 바꾸지 않았다. 이 힌트는 wire에 보내지 않는다.
- 단위 검증에서 경로가 가득 차도 64개 및 점프 발동 점을 잃지 않고, 전송 후 60ms만 재개하며 밀린 1초를 따라가지 않는 것을 확인했다. 직선도 100ms 뒤 예측 위치를 보존한다.
- 브라우저에서 전송 콜백을 600ms 보류한 동안 실제 예측 위치가 유지되고, 해제 뒤 키 재입력 없이 달리기가 재개됐다. 울타리 이동/짧은 착지 점프 및 기존 겹침/재질 해제/WebGL 복원까지 3개 시나리오가 통과했다.
- 관련 BE 362개 통과·7개 opt-in 건너뜀(총 369), FE 204개 통과·3개 opt-in 건너뜀(22개 파일), 테스트 타입 검사·공원 빌드·`git diff --check` 통과. 별도 경로 생성 실행에서 224+89개 행렬을 모두 실행했다.
- 실제 인증 소켓 및 벽·바닥·천장·속도/공중 재점프 우회 방지는 관련 BE 회귀로 확인했다. 브라우저 전송은 echo mock이며 실제 Java 검증 재생과 구분한다.

최신 맵의 로컬 독립 실행/서버 검증 범위다. 운영 동시 접속·WAN 지연 분포·모바일/헤드셋 및 공원 전체 게임 흐름은 별도 검수하지 않았다. 최종 테스트 합계·커밋·CI 상태는 MR에 기록한다.
