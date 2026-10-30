# 광장 시설 최종 배치 및 단일 맵 전환 전달 (2026-10-30)

## 작업 범위

브랜치: feat/plaza-lucky-facilities. 다른 개발자의 체크아웃을 건드리지 않고 독립 worktree에서 구현했다. 포토부스 교체 영역의 좌표·방향·충돌 크기는 유지했다. 최신 origin/dev 3703dc14의 랭킹 보드 모델을 배치 미리보기에 반영했으며 실제 공원 화면은 원격 변경의 의도대로 기존 포토부스를 유지한다.

| 시설 | ID | X / Z | 방향 | 충돌 크기 W × D × H |
|---|---|---|---|---|
| 붕어빵 가게 | fish-bread | -29.5 / 36 | +60° | 8.448 × 6.336 × 5.368m |
| 돌림판 (임시 제외) | layout-shop | 예약 좌표 27 / 50.8 | -90° | 현재 충돌·상호작용 없음 |
| 복권방 | layout-drink | 31.8 / 54.6 | 약 -105.13° · 광장 중앙 방향 | 6.8 × 4.59 × 5.185m |
| 포토부스 교체 영역 | layout-photo | 30 / 35.6 | -60° | 기존 8.8 × 6.6 × 4.6m 유지 |

붕어빵은 이전 돌림판 자리로 이동했다. 공개 가게 외형은 원본의 88%, 복권방 외형은 원본의 85%다. 복권방은 광장 중앙(X0, Z46)을 정확히 바라보도록 대각선으로 배치했다. 입구 연결 길은 광장 안쪽에서 시작해 입구 문턱 아래까지 2.4m 폭으로 곧게 이어진다.

두 가게는 이전 소형 검증본보다 약 25% 확대했다. 확대된 크기를 유지하면서 복권방 지붕과 울타리까지 우측 잔디 구획(X20~37, Z48~60) 안에 배치했다. 랭킹 보드 미리보기는 원본의 94%로 조정해 지붕이 기존 울타리 폭 안에 들어오게 했다. 포토부스 교체 영역의 공용 좌표·방향·충돌 크기는 유지했다.

돌림판은 definition.kiosks.shop.enabled=false로 임시 제외했다. 렌더링·시설 목록·시설 데이터·이동 및 서버 충돌·상호작용에서 빠지며 전용 연결 길도 제거했다. 원본 모델·2D 목업·예약 ID/좌표는 남아 있어 복구할 수 있다. 복구 시 연결 길과 최종 맵 생성물도 함께 검토한다.

공개 가게 크기가 바뀌어도 붕어빵 개인 조리대·카메라·게임 규칙은 바꾸지 않는다. 기존 가로등 42개의 ID·위치, 테이블·좌석·소리함 배치를 유지한다.

## FE/BE가 공유할 좌표와 코드

- 좌표·방향·크기 원본: frontend/src/map/park/definition.ts의 sites, kiosks, fishBreadShop.
- 서버 물리 데이터 생성: frontend/src/map/park/physics.ts. 순수한 물체 크기이며 플레이어 반지름은 포함하지 않는다.
- 최종 BE 입력: frontend/generated/park/server-map.json의 data.facilities, data.physics.boxes, data.interactions.
- FE 접근 판정: features/bungeoppang/access.ts와 construction/model.ts. 길찾기 도착점은 features/navigation/parkNavigation.ts.
- 에셋: world/art/LuckyFacilities.tsx, luckyFacilityGeometry.ts. 목업은 features/luckyFacilities/.

활성 시설 ID는 유지한다. FE 화면 이름과 서버 ID를 혼동하지 않도록 상점 자리 이름이었던 layout-shop은 돌림판의 예약 ID, layout-drink는 복권방으로 사용한다. 현재 layout-shop은 생성물에서 제외되어 있다. 생성 JSON을 손으로 수정하지 않는다.

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

- mapVersion: 70dc0fc5630a6d23d48ea22b5cd665b92bf2d47ee7c81e85d061778e29aa12f3
- server-map.json SHA-256: 15b91df615fdcc008fbf3a0bdce852ec6e0eab794ce58119b163f04f04129062
- 최종 통합 후 다시 생성하면 위 값이 바뀔 수 있다. 인프라에는 최종 합본의 값을 전달한다.
- 이번 작업에서 서버 배포·실행 중 맵 전환은 하지 않았다.

## 확인 및 검증

frontend에서 pnpm exec vite --mode layout-preview --host 127.0.0.1 --port 5211 --strictPort 실행 후 /layout-preview.html의 14·28번으로 확인한다. 13번 돌림판은 목록에서 제외된다. 복권 체험은 API 요청, 잔액 차감, 보상 지급이 없는 로컬 목업이다.

타입 검사, 단위·회귀 테스트 17개 파일 96개, 브라우저 검사 6개, 맵 전달본 검사 및 park-integration 빌드를 검증했다. 데스크톱 1600×1000과 모바일 390×844에서 복권 목업, 키보드, 결과 표시와 조리 외형 전환을 확인했다. 렌더링된 세 시설의 전체 외형과 울타리 끝점이 보행로를 침범하지 않으며, 대각선 연결 길이 실제 메시로 존재하는 것도 검사한다. Browser plugin not available이므로 기존 Playwright를 사용했다. 실제 서버·다인 게임 검증은 배포 단계에서 수행한다.

pathNetwork.ts는 짧은 대각선 연결 길도 기존 곡선 길과 같은 방식으로 합쳐 포장한다. 가로·세로 선분만 처리하던 누락을 수정해 복권방 연결 길 및 기존 대각선 접근로가 화면에 표시된다.

## 분수 가장자리와 계단 화면 수정

분수 포장은 잔디보다 8.5cm 높지만 옆면이 열려 있어 낮은 시점에서 하늘색 틈이 보였다. 같은 128각 외곽선에 옆면을 연결해 막았으며 포장 높이와 보행 충돌은 유지했다.

정자와 돌탑 계단은 겹친 박스 대신 노출면만 있는 연속 형상으로 바꿨다. 단상과 맨 위 디딤면의 중복도 제거해 시점 이동 시 깊이 판정이 경쟁하지 않도록 했다. 관련 파일은 layout-preview/fountainPaving.ts, districtGeometry.ts, sceneGeometry.ts와 새 stairFlightGeometry.ts다.

분수·계단 수정 자체는 렌더링 형상만 바꾸므로 추가 BE 맵 반영을 요구하지 않는다. 위의 현재 버전은 이후 시설 재배치까지 반영한 값이다.

## 최신 dev 병합 확인

origin/dev 3703dc14까지 병합했다. RankingBoardModel.tsx가 기존 포토부스 자리에 보유량·승부사·승수 3개 판을 표시한다. 현재 1~10위의 빈 칸이 있는 표시용 모델이며 실제 랭킹 데이터 요청은 연결되어 있지 않다. PreviewWorld.tsx의 live 분기는 기존 포토부스를 사용한다.

붕어빵·복권방과 소리함 크기, 분수 틈과 계단 수정은 보존했다. 최신 dev 병합만으로는 맵 버전이 바뀌지 않았으며, 이후 시설 재배치 및 돌림판 임시 제외로 위의 현재 버전이 생성됐다. 최종 통합본을 인프라에 전달할 때 공용 맵 생성물을 함께 사용한다.
