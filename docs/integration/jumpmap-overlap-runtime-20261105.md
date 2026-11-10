# 점프맵 겹침 렌더링 및 자원 수명 검증

- 작업 브랜치: `fix/jumpmap-overlap-prewarm`, MR !376. 머지는 보류한다.
- 기준: `origin/dev@de13328b9199e7c1675c716b7cb74083629fd57e`. 데이터 로그 변경에 이어 운영 신규 활동 차단 변경까지 공유 브랜치 이력을 보존해 병합했으며 충돌은 없었다.
- 담당 경로: `frontend/src/world/{Avatars,avatarOpacity,prepareScene}`. 게임 규칙·맵·서버 계약·DB 변경은 없다. 사용자 공유 migration 사용 현황은 V150까지이며 이번 작업에는 migration이 필요 없다.

## 피드백 반영

기존 `appearance.dispose()`는 `useLayoutEffect` 정리에 이미 있었다. 다만 `useMemo`에서 생성한 인스턴스를 StrictMode의 정리/재설정 후 재사용해 준비가 무효화될 수 있었다. 생성·준비·복구 이벤트 등록·해제를 하나의 layout effect에서 소유하고, 재설정마다 새 인스턴스를 생성한다. 퇴장이나 모델 변경 시 원본 재질을 먼저 복구하고 복제 재질만 해제한다.

셰이더 대기는 `compileAsync` 자체가 끝나지 않는 경우도 포함해 컨텍스트 유실·작업 취소·30초 제한을 확인한다. 복원 시 준비를 다시 수행하고 이전 세대의 비동기 완료가 새 준비 상태를 덮어쓰지 않게 한다.

반투명 컴파일은 조명 없음 1회, 전체 켜짐/꺼짐 2회로 제한한다. 일부만 켜진 조명은 현재 상태·전체 꺼짐·전체 켜짐이 서로 다른 변형이므로 3회를 유지한다. 준비 중 바꾼 재질과 조명 가시성은 동기적으로 복구한다.

## 실행 및 결과

`frontend`에서 실행한다. Playwright 설정이 로컬 포트 5309의 park-integration 서버를 시작한다.

```powershell
.\node_modules\.bin\vitest.cmd run tests/unit/avatarOpacity.test.ts tests/unit/prepareScene.test.ts tests/unit/avatarFrame.test.ts tests/unit/remoteMovement.test.ts tests/unit/remoteMovementIntegration.test.ts tests/unit/jumpmapOverlapPosition.test.ts tests/unit/jumpmapPhysics.test.ts tests/unit/reconnectTableState.test.ts tests/unit/behaviorLog.test.ts tests/unit/operationGate.test.ts
.\node_modules\.bin\tsc.cmd --project tsconfig.tests.json --noEmit
node node_modules/@playwright/test/cli.js test --config playwright.jumpmap-overlap.config.ts
npm.cmd run build:park
```

- 단위 테스트 10개 파일 72개, 테스트 타입 검사, park 빌드, 브라우저 시나리오 1개 통과.
- Edge headless, 1440×900, 최신 맵에서 원격 플레이어 겹침을 WORLD_STATE mock으로 재현했다. 실제 운영 서버 연결 검증과 헤드셋 검수는 수행하지 않았다.
- 겹침 전/첫 겹침/반복 겹침 프로그램 수는 모두 118개. 첫 겹침 최대 프레임 간격 41.8ms, 반복 8.8ms. 자신의 좌표·카메라·이동 요청이 계속 갱신되고 입력 잠금과 런타임 오류가 없었다.
- 실제 near/far 메시 재질이 `transparent=true`, `opacity=0.4`로 바뀌는지 검사한다. 이전 userData opacity 값만의 검사로는 실제 반투명을 입증할 수 없었으므로 검증을 강화했다.
- 반투명 상태에서 퇴장 시 고유 복제 재질 1개가 1회 해제되고 원본 재질 복구를 확인했다. 재입장 후에도 반투명이 동작했다.
- 강제 WebGL 컨텍스트 유실/복원 후 실제 반투명 재질과 이동 갱신이 복구됐다. 해당 강제 GPU 복원 구간 최대 간격 342.2ms는 겹침 측정 구간과 구분한다.
- 원본 JSON과 PNG는 저장소 외부 QA 폴더 `runtime-feedback`에 보관한다. 프레임 수치는 이 로컬 장비의 단일 재현 결과이며 다른 GPU/모바일 성능을 보장하지 않는다.

기존 공통 통신·카메라·입력 및 서버 정산 계약은 유지한다. 이번 검증은 렌더링 준비와 퇴장/복원 경로에 한정하며 공원 전체 게임 흐름의 통합 검증 완료를 뜻하지 않는다.
