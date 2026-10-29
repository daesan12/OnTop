# 공원 맵 생성 데이터 · BE 연결 계약 (schemaVersion 2)

현재 브랜치 `feat/park-180-layout-preview`의 FE 생성 도구를 BE 피드백에 맞춰 보강했습니다. **Java/DB/서버 리소스는 수정하지 않았으며 기본 `/park`는 기존 맵을 유지하며 새 맵은 `park-integration` 모드로 연결했습니다.** 새 데이터 규격 검토 후 FE 서비스 맵과 BE 로딩을 함께 전환합니다.

## 전달 파일

- `frontend/generated/park/server-map.json`: 배치, 테이블·로컬 좌석, 시설별 이용 정보, 서버용 3D 형상과 지형 메시
- `frontend/generated/park/manifest.json`: 동일 맵 버전, 파일 체크섬, 입력 소스와 개수
- `frontend/docs/PARK_GENERATION.md`: 생성·검사 방법과 해석 규칙

FE 보강 데이터는 `e88561a`로 커밋·푸시된 **schemaVersion 2**입니다. schemaVersion 1 JSON과 혼용하지 않습니다. 후속 통합 시도 `515a689`는 `11ccdf7`로 취소했으며, 이 문서는 유지된 FE 생성 데이터의 규격을 설명합니다. 실제 연결 요청과 최신 계약 방향은 [PARK_BACKEND_REQUEST.md](PARK_BACKEND_REQUEST.md)를 우선합니다.

BE 추가 요청의 실제 필드·수치와 채팅 회신은 [PARK_BACKEND_CONFIRMATION.md](PARK_BACKEND_CONFIRMATION.md)에 정리했습니다. 테이블 16개는 모두 게임용이며 기존 park-bindings.json 형식을 공통 사용합니다. data.interactions.notes, data.physics.tower/steppingStones를 추가했습니다. Java·CI 직접 수정은 없습니다.

## 1. 원본과 갱신

공통 배치: `frontend/src/map/park/definition.ts`
계산: `resolve.ts`, `lake.ts`, `interactionData.ts`, `physics.ts`

```sh
cd frontend
pnpm map:generate
pnpm map:check
```

동일 입력에서는 동일 JSON과 SHA-256 맵 버전이 생성됩니다. 미리보기 설정 저장·FE 빌드에도 연결되어 있습니다. 생성 파일을 직접 수정하거나 BE 리소스에 수동 좌표를 중복 입력하지 않습니다. 실행 중 서버 핫 리로드는 이번 요청 범위가 아닙니다. BE에서 생성물 포함·빌드·배포·재시작 경로를 연결해 주셔야 합니다.

## 2. 좌표와 테이블

단위 m, Y-up, 북쪽 -Z, yaw는 Y축 라디안입니다. 회전은 `worldX = x + localX*cos(yaw) + localZ*sin(yaw)`, `worldZ = z - localX*sin(yaw) + localZ*cos(yaw)`입니다.

- `data.tables`: 기존 `table-1`~`table-16` 화면 ID와 새 `position`, 기존 순서의 `seatAnchors`를 제공합니다.
- 화면 ID와 기존 서버 `tableId`는 BE에서 매핑합니다. JSON의 ID를 DB 테이블 ID로 직접 간주하지 않습니다.
- `seatAnchors`는 **테이블 기준 로컬 좌표**이며 현재 테이블 yaw는 0입니다. 벤치 등의 이용 Pose와 형식이 다릅니다.
- `spectatorRadius: 3.5`는 현재 FE 관전 판정에 사용되지 않는 기존 메타데이터로 생성물에서 제외했습니다. 서버 관전 허용 거리 **20m는 유지**합니다. 이번 작업에서 서버 정책을 생성 JSON으로 옮기지 않았습니다.

## 3. 서버 충돌: data.physics 사용

**서버는 `data.collision`을 물리 형상으로 사용하지 않습니다.** 그 값은 기존 FE 미리보기의 여유 폭 포함 2D 영역으로 유지했습니다.

`data.physics`는 캐릭터 반경과 이동 여유 폭을 적용하지 않은 **단순화된 3D 물리 프록시**입니다. 모델의 모든 장식 삼각형을 그대로 추출한 시각 메시가 아닙니다.

| 필드 | 의미 |
| --- | --- |
| `boxes[]` | `id`, `center:[x,y,z]`, `half:[hx,hy,hz]`, `yaw`, `role` |
| `meshes[]` | `id`, `vertices:[x,y,z,...]`, `indices:[a,b,c,...]`, `role` |
| `hulls[]` | `id`, `vertices:[x,y,z,...]`, `role` — 볼록 형상 |
| `terrain` | 첫 메시 `terrain`의 반폭·간격·행/열 수·삼각형 순서 |
| `playerInflation`, `collisionMargin` | 둘 다 0. 생성 시 캐릭터 크기/물리 엔진 margin을 더하지 않음 |
| `character` | 현재 캐릭터의 radius, halfHeight, offset 참고값 |
| `spawn` | 높이를 포함한 캐릭터 캡슐 중심 좌표 |

- 모든 vertices는 **월드 좌표**이고 indices는 0부터 시작하는 정점 인덱스입니다. 메시/hull에 시설 위치를 다시 더하면 안 됩니다.
- 박스 `half`는 전체 크기가 아닌 반치수입니다. yaw는 박스 원점에 한 번만 적용합니다.
- 기존 Java의 BoxCollisionShape / MeshCollisionShape / HullCollisionShape로 읽는 어댑터는 BE에서 연결합니다. 기존 캐릭터 캡슐 및 서버 margin 처리는 BE에서 유지·검토하며 **추가 이동 여유 폭을 중복 적용하지 않습니다.**
- `role`은 분류 정보입니다. 지면/바닥도 물리 충돌체로 로딩해야 합니다. `solid`만 필터링하면 바닥이 사라집니다.
- 정자 바닥·계단·기둥·난간, 중앙 돌탑·사방 계단·난간, 호수 다리/디딤돌/낚시 데크, 전망대 나선 경사로·정상 바닥·난간과 주요 시설 프록시를 포함합니다.
- 첫 지형 메시에는 호수 바닥과 분수의 낮은 지형을 포함합니다. 다리·데크·계단은 별도 형상이라 호수 전체를 덮는 수평 바닥을 추가하면 안 됩니다.
- 지형은 현재 2m 정규 격자입니다. 삼각형은 `(a,c,b),(b,c,d)`이며 기존 Java의 두 삼각형 보간 방향에 맞췄습니다. 연속 지형/보이는 곡면과 격자 보간에는 근사 오차가 있습니다.
- 점프맵 게임 발판·코인, 카메라 충돌, 산포 수목/잎과 장식 미세 형상은 이번 서버 물리 범위에서 제외합니다. 서버에서 점프맵 게임을 활성화하는 데이터가 아닙니다.

## 4. 시설별 이용 데이터

`data.interactions.benches`, `.fitness`, `.telescopes`를 제공합니다.

공통 필드: `id`, `kind`, `position:[x,y,z]`, `yaw`, `radius`, `heightTolerance`.

- 벤치: `seats:[{seatIndex:0,use,exit},{seatIndex:1,use,exit}]`. `siteId`는 설명용 안정적인 배치 키이며 서버 시설 식별자는 `id`입니다.
- 운동기구/망원경: 각 레코드의 `use`, `exit`.
- `use`, `exit`: **월드 좌표** `{x,y,z,yaw}`. 시설 좌표를 다시 더하지 않습니다.
- 기존 정자·전망대·분수 벤치의 `bench-*` ID, 운동기구와 망원경 ID를 유지했습니다. 신규 벤치는 별도의 의미 있는 ID를 사용합니다. 배열 순서로 신규 ID를 재발급하지 않습니다.
- 원형 벤치는 네 구간에 각 2석을 배치하고 나무 바깥쪽을 바라보도록 했습니다.
- 이용 Pose는 기존 서비스의 `바닥 기준 +0.8m` 아바타 원점 관례를 유지합니다. 운동기구 이용 높이에는 baseHeight도 반영합니다. **스폰의 캡슐 중심 계산과 혼용하지 않습니다.**
- BE 시설 응답으로 변환할 때 벤치 `seats[].use`를 기존 seats에, 두 좌석이 공유하는 `exit`를 시설 exit에 연결할 수 있습니다. 이용 거리/점유/퇴장 승인 판정은 기존 서버가 담당합니다.

## 5. 스폰

서버에서는 2D `data.world.spawn` 대신 `data.physics.spawn.position:[x,y,z]`를 사용합니다. `origin`은 `capsule-center`입니다.

현재 기본값은 약 `[0,0.84,82]`이며 Y는 지면/보행 바닥 높이 + radius(0.3) + halfHeight(0.48) + offset(0.02) + groundClearance(0.04)입니다. 지형 높이를 포함한 값이므로 서버에서 캐릭터 반높이를 다시 더하지 않습니다. 채널별 여러 스폰 슬롯 배치/중복 방지는 기존 BE 정책에 맞게 연결·검증 부탁드립니다. 물속 스폰은 생성 검증에서 거부합니다.

## 6. 버전 전달과 불일치 — 최신 dev 기준 요청

최신 dev `08360a1`의 `docs/world-map-api.md`에 맞춰 **WORLD_MAP_CONFIRM → WORLD_MAP_STATE** 절차를 유지하는 방향입니다. 이전 CHANNEL_JOIN/GAME_RECONNECT_CHECK의 payload.map 추가 제안과 오류 payload.map 제안은 철회했습니다.

1. BE는 CONNECTED.payload.map에 실제 로딩한 생성 JSON의 최상위 mapId/schemaVersion/mapVersion을 보냅니다. 새 JSON의 schemaVersion은 2입니다.
2. FE는 자신의 번들 identity로 WORLD_MAP_CONFIRM을 보내고 WORLD_MAP_STATE의 verified: true를 확인한 뒤 입장·복구를 진행하도록 연동했습니다.
3. CHANNEL_JOIN은 기존 {channelId}, GAME_RECONNECT_CHECK는 기존 요청 형식을 유지합니다.
4. 오류는 최신 dev의 MAP_VERSION_MISMATCH/MAP_VERSION_REQUIRED와 payload.serverMap을 사용합니다. 확인 전 자동 복구와 관련 상태 전달도 차단합니다.
5. FE는 새로고침·수동 재접속을 안내하고 늦은 응답으로 불일치 상태를 해제하지 않습니다. 재접속마다 다시 검사합니다.

**현재 FE 코드 상태:** 최신 dev의 WORLD_MAP_CONFIRM 승인 절차를 구현했습니다. `park-integration` 모드에서 생성 schemaVersion 2 identity와 새 장면·앵커·내비게이션을 함께 사용하며 기본 모드는 기존 맵을 유지합니다. BE 전달 매핑 16개/채널을 연결했습니다. 실제 접속 서버가 아직 없어 Java 물리 공동 검증은 대기 중입니다. [FE 실행·검증 안내](PARK_FE_INTEGRATION.md)를 참고해 주세요.

메시지 예시·역할·추가 필드 요청·CI 연결과 전환 조건은 [PARK_BACKEND_REQUEST.md](PARK_BACKEND_REQUEST.md)에 정리했습니다.

## 7. 다음 연결과 검증

1. BE에서 schemaVersion 2 물리·시설 데이터와 추가 필드를 검토하고 최신 dev 버전 확인 계약·ID 매핑 전달 방식을 확정.
2. FE 새 맵 모드에서 장면·좌석/시설 앵커·내비게이션·버전·시설 카탈로그 연결을 완료. 기본 서비스 전환은 공동 검증 후 진행.
3. BE에서 JSON 어댑터, 기존 tableId 매핑, 시설 카탈로그, 스폰/수영과 최신 WORLD_MAP_CONFIRM 경로에 실제 생성 identity 연결. CI·빌드는 해당 담당자에게 요청.
4. 같은 JSON·manifest로 계단/다리/전망대·좁은 통로·수영·좌석·퇴장·스폰과 새로고침/재접속/구버전 접속을 통합 검증한 뒤 함께 배포.

이번 FE 검증은 생성 데이터와 네트워크 계약 테스트입니다. **실제 Java 물리 엔진에서의 통행·착지 결과까지 검증한 것은 아니며, 통합 검증이 배포 전 필수입니다.**
