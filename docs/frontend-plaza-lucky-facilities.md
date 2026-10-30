# 광장 시설 최종 배치 및 단일 맵 전환 전달 (2026-10-30)

## 작업 범위

브랜치: feat/plaza-lucky-facilities. 다른 개발자의 체크아웃을 건드리지 않고 독립 worktree에서 구현했다. 포토부스는 다른 개발자의 교체 작업을 위해 기존 모델·좌표·방향·충돌 크기를 유지했다.

| 시설 | ID | X / Z | 방향 | 충돌 크기 W × D × H |
|---|---|---|---|---|
| 붕어빵 가게 | fish-bread | -29.5 / 36 | +60° | 8.448 × 6.336 × 5.368m |
| 돌림판 | layout-shop | 31.8 / 50.38 | -120° | 4 × 2 × 4.3m |
| 복권방 | layout-drink | 27.33 / 56.12 | -120° | 6.8 × 4.59 × 5.185m |
| 포토부스 교체 영역 | layout-photo | 30 / 35.6 | -60° | 기존 8.8 × 6.6 × 4.6m 유지 |

붕어빵은 이전 돌림판 자리로 이동했다. 공개 가게 외형은 원본의 88%다. 돌림판과 복권방은 이전 붕어빵 구역에서 나란히 광장을 바라보며, 충돌 영역 사이 약 1.8m의 통로를 확보했다. 돌림판은 집·울타리가 없는 지면 고정형으로 원본의 110%, 복권방 외형은 원본의 85%다.

복권방은 가로등과의 간섭을 피하도록 정면으로 약 1m 보정했다. 두 가게는 직전 검증본보다 약 25% 확대했다.

공개 가게 크기가 바뀌어도 붕어빵 개인 조리대·카메라·게임 규칙은 바꾸지 않는다. 기존 가로등 42개의 ID·위치, 테이블·좌석·소리함 배치를 유지한다.

## FE/BE가 공유할 좌표와 코드

- 좌표·방향·크기 원본: frontend/src/map/park/definition.ts의 sites, kiosks, fishBreadShop.
- 서버 물리 데이터 생성: frontend/src/map/park/physics.ts. 순수한 물체 크기이며 플레이어 반지름은 포함하지 않는다.
- 최종 BE 입력: frontend/generated/park/server-map.json의 data.facilities, data.physics.boxes, data.interactions.
- FE 접근 판정: features/bungeoppang/access.ts와 construction/model.ts. 길찾기 도착점은 features/navigation/parkNavigation.ts.
- 에셋: world/art/LuckyFacilities.tsx, luckyFacilityGeometry.ts. 목업은 features/luckyFacilities/.

시설 ID는 유지한다. FE 화면 이름과 서버 ID를 혼동하지 않도록 상점 자리 이름이었던 layout-shop은 돌림판, layout-drink는 복권방으로 사용한다. 생성 JSON을 손으로 수정하지 않는다.

## 포토부스 담당자와 병합

포토부스 담당자는 이 작업과 BE 변경이 합쳐진 통합 브랜치를 기준으로 작업한다. PlazaBuildings.tsx 전체를 이전 버전으로 덮어쓰지 않고 photo 분기를 교체한다. 교체 사물의 바닥 크기·높이·충돌·상호작용 위치가 달라지면 같은 definition/physics/interaction 원본에 반영한다.

각자의 생성물에서 server-map.json과 mapVersion.ts 일부만 골라 섞지 않는다. 충돌이 나면 먼저 공용 소스의 변경을 모두 합치고 최종 합본에서 생성물을 다시 만든다.

## 맵 전환을 한 번으로 묶는 절차

1. 현재 FE 변경과 BE 변경을 통합 브랜치에 병합한다. 중간 맵을 서버에 배포하지 않는다.
2. 포토부스 담당자가 그 통합본에서 작업하고 변경을 합친다.
3. 최종 배치가 확정된 합본에서 frontend의 pnpm map:generate와 pnpm map:check를 실행한다.
4. 저장소 루트의 python infra/ci/check_park_handoff.py, FE 테스트·build:park, BE 전달본 테스트를 통과시킨다.
5. 인프라 담당자에게 같은 커밋의 server-map.json, manifest.json, mapVersion, SHA-256을 한 세트로 전달한다. FE 빌드도 동일한 mapVersion.ts를 포함한다.
6. 기존 infra/app/PARK_MAP_ROLLOUT.md 절차로 해당 환경의 BE 맵과 FE를 함께 전환하고 입장·이동·시설·재접속을 확인한다.

개발 중 해시는 여러 번 바뀔 수 있다. 서버 전환을 마지막에만 실행하면 해당 환경에서 한 번의 공동 전환으로 묶을 수 있다. 중간 FE/BE 배포 후 위치·충돌·맵 소스를 바꾸면 추가 전환이 필요하다. DEV와 PROD는 각각 전환한다. 통합 브랜치에서 작업하거나 중간 자동 배포가 실행되지 않도록 조율해야 한다.

외형 모델 파일만 교체하고 맵 원본·좌표·충돌이 그대로인 변경은 mapVersion을 바꾸지 않을 수 있다. 현재 버전은 맵 데이터와 map/config 소스 해시를 함께 계산하므로, 데이터가 같더라도 해시 대상 소스가 바뀌면 버전이 달라진다.

## 현재 로컬 검증본 — 최종 통합본 아님

- mapVersion: 448b20e7d1a24ed53dc41e2a628c5a52fafb6c38df038daea12118ddf708755b
- server-map.json SHA-256: e94e7fe9ef87abcd55d5a8ed962f3cca53e6fa984736c80280a591fc6c062bd8
- 최종 통합 후 다시 생성하면 위 값이 바뀔 수 있다. 인프라에는 최종 합본의 값을 전달한다.
- 이번 작업에서 서버 배포·실행 중 맵 전환은 하지 않았다.

## 확인 및 검증

frontend에서 pnpm exec vite --mode layout-preview --host 127.0.0.1 --port 5211 --strictPort 실행 후 /layout-preview.html의 13·14·28번으로 확인한다. 돌림판·복권 체험은 API 요청, 잔액 차감, 보상 지급이 없는 로컬 목업이다.

타입 검사, 단위·회귀 테스트 12개 파일 77개, 시설 목업 브라우저 검사 3개와 지면 브라우저 검사 2개, 맵 전달본 검사 및 park-integration 빌드를 검증했다. 데스크톱 1600×1000과 모바일 390×844에서 목업, 키보드, 결과 표시와 조리 외형 전환을 확인했다. Browser plugin not available이므로 기존 Playwright를 사용했다. 실제 서버·다인 게임 검증은 배포 단계에서 수행한다.

## 분수 가장자리와 계단 화면 수정

분수 포장은 잔디보다 8.5cm 높지만 옆면이 열려 있어 낮은 시점에서 하늘색 틈이 보였다. 같은 128각 외곽선에 옆면을 연결해 막았으며 포장 높이와 보행 충돌은 유지했다.

정자와 돌탑 계단은 겹친 박스 대신 노출면만 있는 연속 형상으로 바꿨다. 단상과 맨 위 디딤면의 중복도 제거해 시점 이동 시 깊이 판정이 경쟁하지 않도록 했다. 관련 파일은 layout-preview/fountainPaving.ts, districtGeometry.ts, sceneGeometry.ts와 새 stairFlightGeometry.ts다.

이 수정은 렌더링 형상만 바꾼다. server-map.json과 mapVersion은 위의 기존 값으로 유지되므로 추가 BE 맵 반영이나 별도 인프라 전환을 요구하지 않는다.
