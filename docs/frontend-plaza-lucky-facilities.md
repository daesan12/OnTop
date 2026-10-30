# 광장 뽑기방·복권방·붕어빵 가게 목업 (2026-10-30)

## 작업 공간과 범위

- 브랜치: `feat/plaza-lucky-facilities`
- 기준: `5529133f` (`fix/frontend-park-polish`의 깨끗한 체크아웃)
- 다른 개발자의 체크아웃에서 작업하지 않고 별도 `frontend-plaza-lucky-facilities` worktree에서 구현했다.
- 상점 → 돌림판 뽑기방, 응모부스 → 복권방, 붕어빵 카트 → 한옥 가게를 Three.js 로우폴리 코드 에셋으로 교체했다. 추가 요청에 따라 뽑기방 집·울타리를 제거하고 돌림판만 35% 확대했다.
- 포토부스의 모델·위치와 소리함 위치는 변경하지 않았다. 랭킹 보드 담당자의 변경을 별도로 합쳐야 한다.

## 확인 방법

`frontend`에서 `pnpm exec vite --mode layout-preview --host 127.0.0.1 --port 5211 --strictPort` 실행 후 `/layout-preview.html`을 연다.

- 13 뽑기방 → 무료 목업 체험: 돌리기, 결과 표시, 다시 돌리기, Esc/닫기.
- 14 복권방 → 무료 목업 체험: 체험권 열기, 결과 연출, 새 체험권.
- 28 붕어빵 가게: 포토부스 남쪽으로 이동하고 15% 축소한 건물 외형 확인.
- 두 체험 화면은 로컬 목업이다. 구매·잔액 차감·보상·실제 당첨 API를 호출하지 않는다.
- 실제 공원에서는 기존 근접 판정과 E/클릭 경로로 뽑기방·복권방 목업을 연다.

## 동시 개발 시 병합 경계

새 에셋은 `frontend/src/world/art/luckyFacilityGeometry.ts`, 렌더 컴포넌트는 `LuckyFacilities.tsx`, 목업 UI는 `frontend/src/features/luckyFacilities/`에 분리했다.

공용 파일은 다음 블록만 병합한다.

| 파일 | 변경 블록 |
|---|---|
| `layout-preview/PlazaBuildings.tsx` | shop/drink의 기존 생성 코드 제거 및 새 컴포넌트 분기. photo 생성 코드는 유지 |
| `layout-preview/PreviewWorld.tsx` | 기존 fish-bread 그룹 내부의 컴포넌트 교체 |
| `layout-preview/plazaBuildingStructure.ts` | 지붕 연결재 높이 옵션 추가. 기존 호출의 기본 동작 유지 |
| `features/construction/ConstructionNotice.tsx` | shop/drink ID의 목업 패널 분기 |
| `features/interactions/parkInteraction.ts` | 두 시설의 상호작용 안내 문구 |
| `map/park/definition.ts` | fishBreadShop 위치·회전·크기, 접근로, 기존 가로등의 고정 앵커 |
| `map/park/resolve.ts`, `physics.ts`, `collision.ts` | 회전된 붕어빵 충돌, 작은 돌림판 충돌, 돌림판 울타리 제거, 주변 식재 정리 |
| `park/mapConfig.ts`, `features/bungeoppang/access.ts`, `features/navigation/parkNavigation.ts` | 새 맵의 붕어빵 크기·회전 및 광장 방향의 접근 판정·길찾기 도착점 |

시설 ID `layout-shop`, `layout-drink`, `layout-photo`, `fish-bread`를 유지한다. 테이블·좌석·게임 네트워크 계약은 바꾸지 않았다. 랭킹 보드 작업과 `PlazaBuildings.tsx`를 통째로 덮어쓰지 않도록 한다.

맵 생성물과 체크포인트는 공용 소스를 먼저 병합한 뒤 최종 합본 기준으로 다시 생성·검증한다. 서로 다른 브랜치의 `server-map.json`과 `mapVersion.ts`를 섞지 않는다.

## 충돌과 조리 화면

- 붕어빵은 포토부스 남쪽 빈 구역 X 30, Z 54로 이동하고 광장 중심을 향해 -120° 회전했다.
- 새 맵의 붕어빵 외형은 이전 대비 85%이며 충돌 크기는 8.16 × 6.12m, 높이는 5.185m이다. 기존 서비스 맵의 카트 크기는 유지한다.
- 접근은 회전한 가게의 정면(광장 방향)에서만 허용한다. 가게 내부·뒤쪽과 비정상 좌표는 거절한다. 길찾기도 같은 정면으로 도착한다.
- 돌림판 발은 지면에 닿고 집·선반·간판·울타리는 제거했다. 돌림판 충돌 크기는 4.8 × 2.4m, 높이 5.2m로 줄였다.
- 시설 크기 변경으로 가로등 배열 순서가 바뀌지 않도록 기존 앵커 42개를 고정했다. 기존 가로등 ID·위치, 게임 테이블·좌석은 유지했다.
- 공개 건물의 기둥·보·간판은 겹쳐 연결하고, 지붕은 두께가 있는 면과 내부 연결재로 접합했다.
- 붕어빵 조리 중과 카메라 복귀 중에는 새 외형을 숨기고 기존 카트·개인 조리 세트를 유지한다. 조리대·카메라·게임 규칙은 확대하지 않았다.

## 서버 반영

확대된 충돌 때문에 새 맵 버전이 필요하다. 이 작업에서 서버 설정이나 운영 배포는 변경하지 않았다.

- `mapVersion`: `4f0c298dd6e0100800326b2a22c996b4fe7fb7e39b2e1505cfb06b1719ad18b5`
- `server-map.json` SHA-256: `ff6cc3064a761a77080869c8514064c4e74654561479ec9deaa57d70900dca28`
- 전달 파일: `frontend/generated/park/server-map.json`, `manifest.json`

최종 합본에서 `pnpm map:generate`, `pnpm map:check`, `python infra/ci/check_park_handoff.py`를 실행하고 기존 `infra/app/PARK_MAP_ROLLOUT.md` 절차대로 같은 버전의 FE와 BE 맵을 반영한다. 이후 다른 작업과 합치면 위 버전·해시는 바뀐다.

## 검증

- 타입 검사: 앱 및 테스트 TypeScript 검사 통과.
- 단위·회귀 검사: 8개 파일, 49개 테스트 통과. 기존 19,881개 이동·높이·수영 표본의 기준은 돌림판 축소와 붕어빵 이동에 맞춰 갱신했다. 체크포인트에서 가로등·테이블·정자·운동기구 등 나머지 배치는 변하지 않았음을 확인했다.
- 브라우저: Edge/Playwright. Browser plugin not available이므로 프로젝트 Playwright를 사용했다.
- 데스크톱 1600×1000, 모바일 390×844에서 목업 화면, 포커스 순환, Esc, 회전 중 재입력 방지, 표시 결과와 정지 구간 일치, API 미호출을 확인했다.
- 지붕·기둥·간판 연결과 붕어빵 공개 외형/개인 조리 세트 전환을 브라우저에서 검사했다.
- `park-integration` 프로덕션 빌드와 맵 전달본 검사 통과.
- 실제 서버 접속과 다인 게임 회귀는 이번 로컬 목업 검증 범위에 포함되지 않는다.
