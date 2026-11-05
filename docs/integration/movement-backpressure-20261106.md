# 전송 지연 시 이동 경로 상한 처리

- 작업 브랜치 `fix/jumpmap-overlap-prewarm`, 현재 재리뷰 MR !392에 누적, 머지는 보류한다. 기존 MR !376은 사용자 승인으로 닫았으며 리뷰 이력을 보존했다.
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

## 추가 리뷰: 중간 착지 배치의 상승 상한

수신 간격을 1ms로 압축한 보고가 공중에서 시작하고 얇은 발판에 착지·재점프하면 각 점은 승인 가능해도 앞단 전체 상승 검사에서 VERTICAL로 거절됐다. 실제 Bullet 얇은 발판과 지지면별 점프 속도가 다른 모형 모두 수정 전 회귀가 실패하고 수정 후 승인된다. 정상 60ms 간격도 함께 확인한다. 이는 서버 경계 조건 재현이며 운영 TCP 지연 분포의 재현 결과는 아니다.

후속 런타임 수정은 BE 공통 `world/movement/ClientPositionValidator.java`에 한정한다. 각 점의 기존 검증이 성공하고 서버 지지 출발점에서 새 Flight를 만든 경우에만 해당 점프의 출발 높이·속도로 전체 상승 상한을 보완한다. 전체 낙하 한도는 먼저 유지하며, 상승 한도는 전체 구간 검증 후 최종 커밋 전에 검사한다. 실패 시 기존 체크포인트로 위치·순번·예산·비행·공중 체류·보류 입력 상태를 복구한다.

`PositionBatchRiseTests`는 1ms/60ms, 실제 얇은 발판, 착지점에서 발동한 점프를 확인한다. 공중 jump 표식만으로는 한도를 늘릴 수 없고, 새 착지 후에도 충돌·점프 높이 초과는 거절한다. 전체 상승 검사에서 거절한 뒤의 재시도는 거절이 없었던 대조 검증기와 같은 예산·위치·결과를 얻는다. 기존 `PositionPathTests`의 실제 벽·바닥·천장 관통 및 중간점으로 나눈 과도한 낙하 차단도 유지한다.

기준 dev는 위의 `8e971321`이며 추가 통합 충돌은 없다. FE 백프레셔·Rapier 물리·타이머·프로토콜·맵·게임 규칙·DB/migration은 바꾸지 않는다. 단독 재실행: backend에서 `./gradlew test --tests com.ssafy.ontop.world.movement.PositionBatchRiseTests --tests com.ssafy.ontop.world.movement.PositionPathTests`. 전체 관련 회귀와 기존 224+89개 FE 수집 경로의 Java 재생 결과는 MR에 기록한다.

후속 수정 후 관련 BE 총 375개 중 368개 통과·7개 opt-in 건너뜀. 새 경계 조건 6개, 기존 실제 관통 차단·전체 상승/낙하 한도·인증 WebSocket·따라가기/재접속 회귀를 포함한다. 기존 동일 맵/FE에서 수집한 224개 경로 9,674건과 지연 89개 경로 1,149건을 수정된 Java 검증기에 다시 재생해 보정 0건, 최대 64점 유지. FE/브라우저는 이번 후속 수정에서 변경하거나 재실행하지 않았으며 위의 이전 검증과 구분한다.
