# 180m 공원 공통 설정

이번 단계는 확정된 FE 미리보기의 배치·충돌 원본을 정리한 것이다. 미리보기의 외형, 시설/테이블 ID, 좌석 앵커와 이동 결과를 유지한다. Java, DB, 실제 `/park` 서비스 맵, 기존 서비스 `EXPECTED_MAP_VERSION`은 변경하지 않는다.

## 수정할 파일과 데이터 흐름

`frontend/src/map/park/definition.ts`에서 주요 배치를 수정한다.

| 입력 | 관리하는 내용 |
| --- | --- |
| `park` | 공원/배경 크기, 스폰, 담장 모서리, 이동 경계, 외곽 산책로 |
| `sites` | 주요 시설의 X/Z 위치, 중앙 돌탑 바닥 높이 |
| `pavilions`, `tables` | 고정 ID별 정자 위치, 정자 밖 테이블 위치 |
| `kiosks` | 상점·응모·포토부스 폭/깊이/회전 |
| `routes`, `curvedRoutes` | 도로 중심선, 폭, 곡선 처리 구간 |
| `vrCourt`, `fitness`, `event`, `plaza` | 구역 바닥·울타리 크기 및 배치 |
| `vrEdgeTrees`, `vrStoneSets`, `plazaRest*`, `plazaBins` | 기존 충돌 판정에 포함된 추가 수목·가구 |
| `lake` | 호수 크기·수면·깊이, 호수 기준 다리/데크/진입로/식물 오프셋 |
| `pagoda`, `collision` | 계단/난간 치수, 기존 이동 여유 폭 |
| `physics` | 서버 지형 격자 간격, 스폰 지면 여유, 물리 담장 치수 |

`resolveParkLayout(definition)`은 입력을 검사한 뒤 화면용 배치, 테이블, 울타리 선분, 충돌, 이동 높이/수영 판정을 계산한다. `index.ts`는 같은 결과를 한 번 생성한다. 미리보기의 `layout.ts`/`lakeLayout.ts`는 이 결과를 재사용한다. 호수 수면·물고기·물가, 중앙 돌탑 광장/계단, 정문/외곽 담장, 광장 바닥에 남아 있던 주요 좌표 중복도 공통 값으로 연결했다.

기존 모델의 치수·테이블 좌석/자산 ID·정자 바닥 높이와 크기 등은 `src/config`의 기존 메타데이터를 읽어 유지한다. 기존 파일을 복제하거나 수정하지 않는다. 공통 모듈은 Three.js/React/DOM/네트워크를 사용하지 않는다.

## 좌표와 ID 규칙

- 단위는 미터, Y-up, 북쪽은 -Z다. X=0/Z=0이 공원 중심이다.
- yaw는 라디안이다. 로컬 +Z를 정면으로 하며 양의 yaw는 정면을 +X 쪽으로 돌린다.
- `P0`~`P8`, `table-1`~`table-16`과 시설 ID를 유지한다. 응모부스의 기존 ID는 `layout-drink`다. ID를 배열 순서나 한국어 표시명으로 다시 만들지 않는다.
- 테이블 `seatAnchors`는 테이블 원점 기준 로컬 앵커다. 현재 테이블 yaw는 0이며, 좌석 순서와 인덱스는 기존 서비스 값을 유지한다. 캐릭터의 최종 앉기 자세/높이까지 새로 정의한 값은 아니다.
- `MARKERS` 01~27은 설명용 지도 표식이며 서버 시설 목록 전체를 뜻하지 않는다. 배경 도로/건물은 플레이 영역에 포함되지 않는다.

예: `sites.shop`과 `kiosks.shop`을 바꾸면 건물·표식·붙는 울타리·회전 충돌이 함께 계산된다. 정자를 옮기면 해당 정자의 테이블·계단·울타리가 따라간다. `lake.x/z/rx/rz`를 바꾸면 호수 기준 다리·낚시 데크·물가 난간·수영 판정이 재계산된다.

**연결 도로의 중심선은 독립적인 설계 입력이다.** 시설을 옮길 때 `routes`의 진입 연결도 검토해야 한다. 공원 크기를 변경해도 시설을 비례 확대하거나 길을 자동 설계하지 않는다. VR 구역의 개별 건물·뜰·식재처럼 별도 좌표로 관리하는 요소들도 함께 검토한다.

## 충돌 구조와 현재 범위

`collision.ts`의 `MapCollision`은 함수가 없는 직렬화 가능한 데이터다. FE `canWalk`도 이 데이터를 사용한다.

| 형태 | 필드 | 용도 |
| --- | --- | --- |
| `rounded-square` | `half`, `radius` | 플레이 경계; 공원 반폭 90m에서 기존 1.2m 안쪽 |
| `box` | `x/z`, `halfX/halfZ`, `yaw` | 테이블, 가구, 건물 등; 회전 키오스크는 AABB 중복 충돌 제외 |
| `circle` | `x/z`, `radius` | 가로등 및 운동마당 큰 나무 |
| `segment` | `from/to`, `radius` | 출입구를 비운 울타리·돌 난간·호수/낚시 난간 |
| `annular-sector` | `x/z`, 안팎 반지름, 시작/끝 각도 | 운동마당 나무 주위 벤치의 네 방향 개구부 |

이 데이터는 기존 미리보기의 **유효 이동 금지 영역**이다. 사각형에는 기존 0.3m 여유 폭을 포함하며 선분의 radius 역시 기존 판정 폭이다. **schemaVersion 2 서버 물리는 이 목록을 읽지 않고 별도의 `data.physics`를 읽는다.** 2D/3D 데이터를 합쳐서 로딩하지 않는다.

`DRAFT_BOXES`와 `FENCE_BLOCKERS`는 식재 제외 범위 등에서도 사용하는 보조 AABB다. `physics.ts`는 이를 역산하지 않고 공통 설정과 기존 모델 메타데이터에서 3D 형상을 계산한다. 캐릭터 반경/여유 폭을 포함하지 않은 boxes/meshes/hulls, 높이를 포함한 스폰을 생성한다. `data.physics`의 terrain 메시가 첫 메시이며, 다리/바닥은 별도 형상이다.

바닥 높이는 `walkHeight`, 수영 여부는 `lake.swimmingAt`이 계산한다. 공통 데이터 `surfaces`에는 정자/계단·돌탑/계단·분수·호수·다리/접속부·낚시 데크/접속부의 파라미터를 정리했다. 높이의 적용 우선순위는 다리 → 낚시 데크 → 호수 바닥 → 정자/계단 → 중앙 돌탑/계단 → 분수 → 기본 0이다. JSON에는 실행 함수가 없으므로 Java에서 이 규칙을 그대로 실행하는 연결은 별도 구현 대상이다.

현재 충돌의 정확도를 확대하지는 않았다. 일반 산포 수목, 일부 벤치·정자의 기둥·장식물 등은 기존 미리보기와 마찬가지로 별도 이동 충돌이 없거나 단순 범위만 사용한다. 카메라 충돌·점프 발판의 3D 착지 충돌도 이 2D 목록과 별도다. 전체 점프 코스/연출은 `layout-preview/jumpCourse.ts` 등에서 관리하며, 자동화의 서버 판정 범위는 추후 합의한다.

## 생성 도구가 읽는 결과

```ts
import { PARK_DATA, resolveParkLayout } from './src/map/park'
// PARK_DATA 또는 resolveParkLayout(customDefinition).data
// metadata / world / facilities / pavilions / tables / interactions
// paths / perimeter / fences / collision / physics / surfaces
```

`PARK_DATA`는 화면 객체나 함수를 포함하지 않아 JSON으로 직렬화할 수 있다. 서버용 JSON 생성·FE 미리보기 버전 자동 갱신·생성물 검사 명령까지 연결했다. `interactionData.ts`에서 개별 벤치/운동기구/망원경의 이용·퇴장 Pose를 계산한다. 유지되는 벤치·기구·망원경 ID는 기존 값을 유지하고 신규 벤치는 안정적인 배치 ID를 사용한다. `spectatorRadius`는 사용하지 않는 기존 메타데이터여서 생성물에서 제외하며 서버 관전 거리 20m를 유지한다. 출력 경로와 해시 규칙은 [PARK_GENERATION.md](./PARK_GENERATION.md), 서버 계약과 전환 조건은 [PARK_BE_HANDOFF.md](./PARK_BE_HANDOFF.md)에 정리했다.

이어 진행할 작업:

1. 보강한 schemaVersion 2의 3D 형상·지형 메시·시설별 Pose 및 요청/오류 map 필드 위치를 BE와 최종 확인한다.
2. 생성 도구는 구현했다. `pnpm map:generate`로 JSON/FE 버전을 함께 갱신하고, `pnpm map:check`로 일치 여부를 검사한다.
3. 실제 서비스 FE가 새 배치를 읽도록 전환하고 FE 버전을 생성 결과와 연결한다.
4. BE 개발자가 생성 JSON 로딩·기존 테이블 좌표 연결·버전 확인을 Java 쪽에 연결한다.

## 검증

- `parkDefinition.test.ts`: 상점 이동/회전/확대, 정자·테이블·계단 이동, 호수 이동/축소, 경계 확대의 연동과 잘못된 입력 거부.
- `parkCheckpoint.test.ts`: 커밋 `11c543c`의 기존 배치 지문과 19,881지점 이동·높이·수영 판정이 동일한지 확인. 설정 분리 이전에 기록한 기준이며 자동 덮어쓰기 코드는 남기지 않는다. 향후 의도적인 맵 변경 때 기준 갱신은 명시적으로 검토한다.
- 기존 배치·점프/수영·기와 담장/도로·가구 회귀 검사도 유지한다.

실행: `pnpm map:check`, `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test`, `pnpm build`, `pnpm exec playwright test --config playwright.layout.config.ts`.
Browser plugin not available: 기존 Playwright + Edge 구성으로 렌더링과 조작을 검증한다.
