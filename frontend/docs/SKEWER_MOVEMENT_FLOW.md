# 꼬치왕 서빙 이동·방향 전환 보완

- 기준: `origin/dev@88e1f60a58163530e2b4d1b30f4ffcddb34a3fcd` (MR !437·!448 통합 이후).
- 작업: `fix/skewer-movement-flow-20261108`, `OnTop/skewer-movement-20261108`.
- 범위: `SKEWER_COOP`의 서버 이동 속도와 꼬치왕 FE 위치 재생·회전 표시. 다른 게임·공통 WS·인증·공원 맵·DB/Flyway 변경 없음.
- 기존 worktree와 미커밋 자료는 그대로 보존하며 새 worktree에서 작업한다. 개발 의존성만 기존 설치본과 연결하고 Vite 캐시는 별도 경로를 사용한다.

## 원인과 수정

기존 PositionPlayback은 서버 경과 시간이 아니라 프레임에서 응답을 받은 시각으로 샘플을 나눴다. 같은 틱의 MOVE 응답이 추가되거나 도착 간격이 흔들리면 동일 좌표 구간이 삽입돼 잠깐 멈췄다가 빨라졌다. 기존 `publicState.elapsed`를 재생 시각으로 사용하고 같은 서버 틱의 응답은 마지막 샘플을 교체한다. 전송 계약이나 공통 소켓의 직렬 처리는 변경하지 않는다.

서버 확정 좌표 사이의 선형 보간을 유지하며 앞질러 외삽하지 않는다. 100ms 틱과 약 30ms 도착 지터를 수용하도록 표시 완충을 120ms에서 150ms로 조정한다. 네트워크가 길게 끊기면 마지막 확정 위치에서 멈추므로 모든 환경의 무지연을 보장하는 변경은 아니다. 라운드·큰 위치 변경·일시정지 때 기준 시각도 함께 초기화한다. Page가 화면 복귀 첫 프레임에 보내는 dt=0 또는 250ms를 넘는 긴 프레임 공백에서도 서버 시각을 다시 맞춰 숨겨져 있던 시간을 뒤늦게 재생하지 않는다.

이동 속도는 서버와 로컬 프리뷰 모두 6.5 → 5.8(약 10.8% 감소)로 맞췄다. 직선/대각선 동일 속도, 축별 충돌 검사, 16회 이동 반복 상한, E 직전 정지 및 권한·중복 요청·종료 처리는 유지한다.

기존 HallMotion은 180도 전환의 첫 60Hz 프레임에 약 99.1도를 반영했다. 각속도를 보존하는 임계 감쇠로 바꿔 같은 첫 프레임을 약 30.1도로 낮추고, 100ms 안에 목표 회전의 90% 이상을 반영한다. 위치에는 추가 보간·가감속을 적용하지 않아 원형 이동의 반경과 이동량을 줄이지 않는다.

## 회귀와 독립 실행

```powershell
# frontend
node node_modules/vitest/vitest.mjs run # 실제 실행 시 skewer/vrZone 테스트 경로를 선택한다.
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --project tsconfig.tests.json --noEmit
node node_modules/@playwright/test/cli.js test --config playwright.skewer-movement.config.ts
node node_modules/vite/bin/vite.js --config vite.skewer-movement.config.ts

# backend
.\gradlew.bat test --offline --no-daemon --tests '*SkewerCoopFeedbackTests' --tests '*SkewerCoopEngineTests' --tests '*SkewerCoopRoomTests' --tests '*SkewerCoopMaintenanceTests' --tests '*SkewerCoopActivationTests'
```

프리뷰: `http://127.0.0.1:5280/tests/skewer-coop/fixtures/movement.html`. 브라우저의 테스트 전용 `movementQA.run(false/true)`는 실제 OnlineHall → ServiceScene에 합성 서버 시각·응답 지터·중복 MOVE 응답을 넣는다. 제품 코드에는 테스트 API를 추가하지 않는다. 기존 feedback fixture도 실제 서버처럼 이동과 함께 elapsed를 증가시킨다.

- 수정 전 추가 회귀 3개 실패로 위치 멈춤과 첫 프레임 급회전을 확인했다.
- 단위 28개 파일 242개 통과. 60Hz·±33ms 도착 간격·동일 틱 중복 응답 시 정상 재생 구간의 프레임 이동량은 0.0966667이며 정지 프레임은 0이다. 이 값은 합성 시나리오의 기능 측정이며 실제 서버 FPS 측정은 아니다. 마지막 화면 복귀 보완 전 추가한 두 회귀도 실패로 문제를 검출한 뒤 통과했다.
- 서버 이동·경로·충돌·키보드 대각선·기권·연결 상태·재시작 관련 선택 테스트 61개 통과(실패/오류/건너뜀 0).
- 브라우저 검증은 Browser plugin not available에 따라 저장소 Playwright/Chrome을 사용한다. 실제 WebGL 렌더러의 지터/방향 전환과 PC/VR UI·일시정지·인사·재시작 회귀를 함께 실행한다.
- 브라우저 전체 38개(3.9분) 통과 후 화면 복귀·긴 프레임 공백 보완을 적용했고, 최종 코드에서 이동·PC/VR UI·일시정지 관련 18개를 다시 실행해 모두 통과했다(1.9분). 실제 렌더러의 합성 응답 지터/180도 전환/화면 복귀 좌표도 확인했다. 소스·테스트 타입 검사, 통합 Vite 빌드, diff check 통과. 페이지·콘솔 오류 및 Vite 오류 오버레이 없음. 기존 shader 정밀도·Three CJS deprecation·큰 청크 경고는 남아 있다. 산출물은 저장소 밖 `skewer-movement-20261108`에 보관한다.
- 실제 Quest 착용, 배포 DEV 두 계정 플레이·정산·측정하지 않은 네트워크 조건은 검증 범위에 포함하지 않는다. Jenkins는 dev 전용이므로 기능 브랜치 결과로 기존 dev 빌드를 인용하지 않는다. 머지는 별도 요청까지 보류한다.
