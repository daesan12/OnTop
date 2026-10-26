# 공원 맵 생성 데이터 · BE 연결 계약 (schemaVersion 2)

현재 브랜치 `feat/park-180-layout-preview`의 FE 생성 도구를 BE 피드백에 맞춰 보강했습니다. **Java/DB/서버 리소스는 수정하지 않았으며 실제 `/park`는 기존 맵을 유지합니다.** 새 데이터 규격 검토 후 FE 서비스 맵과 BE 로딩을 함께 전환합니다.

## 전달 파일

- `frontend/generated/park/server-map.json`: 배치, 테이블·로컬 좌석, 시설별 이용 정보, 서버용 3D 형상과 지형 메시
- `frontend/generated/park/manifest.json`: 동일 맵 버전, 파일 체크섬, 입력 소스와 개수
- `frontend/docs/PARK_GENERATION.md`: 생성·검사 방법과 해석 규칙

이번 수정은 이전 전달 커밋 `bb1ff1b` 이후의 **schemaVersion 2**입니다. 이전 커밋의 schemaVersion 1 JSON과 혼용하지 않습니다. 아직 이번 수정의 커밋·푸시는 진행하지 않았습니다. 전달 시 수정 소스와 생성물 전체를 같은 커밋으로 공유합니다.

## 1. 원본과 갱신

공통 배치: `frontend/src/map/park/definition.ts`
계산: `resolve.ts`, `lake.ts`, `interactionData.ts`, `physics.ts`

```sh
cd frontend
pnpm map:generate
pnpm map:check
```

동일 입력에서는 동일 JSON과 SHA-256 맵 버전이 생성됩니다. 미리보기 설정 저장·FE 빌드에도 연결되어 있습니다. 생성 파일을 직접 수정하거나 BE 리소스에 수동 좌표를 중복 입력하지 않습니다. 서버가 실행 중인 데이터를 자동으로 재로딩하는 기능은 BE 담당 범위입니다.

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

## 6. 버전 전달과 불일치

BE 제안대로 `CONNECTED.payload.map`에 **실제로 로딩한 데이터의** 다음 세 값을 전달합니다.

```json
{"mapId":"park","schemaVersion":2,"mapVersion":"<64자리 SHA-256>"}
```

FE 입장·복구 요청은 동일 구조를 `payload.map`에 담도록 구현했습니다.

```json
{"type":"CHANNEL_JOIN","payload":{"channelId":"...","map":{"mapId":"park","schemaVersion":2,"mapVersion":"<FE에 포함된 버전>"}}}
```

`GAME_RECONNECT_CHECK` 요청에도 같은 `map`을 넣습니다. 소켓 재접속 시 CONNECTED를 다시 확인하고 CHANNEL_JOIN부터 진행합니다. BE는 입장 및 상태 복구 **이전**에 비교합니다. 핸드셰이크 이전에 자동 복구되는 경로가 있다면 그 경로도 BE에서 차단·검증해야 합니다.

불일치 오류의 서버 맵 정보 위치도 아래처럼 `payload.map`으로 통일하는 것을 제안하며, FE는 이 형식을 처리하도록 구현했습니다. **요청/오류의 map 필드 위치와 schemaVersion 2는 최종 확인 부탁드립니다.**

```json
{"type":"ERROR","requestId":"<원 요청 ID>","payload":{"code":"MAP_VERSION_MISMATCH","message":"맵 버전이 다릅니다.","map":{"mapId":"park","schemaVersion":2,"mapVersion":"<서버 로딩 버전>"}}}
```

FE는 불일치 시 입장·이동·시설 이용을 멈추고 기존 상태를 정리한 뒤, 페이지 새로고침과 수동 재접속 버튼을 제공합니다. 같은 오래된 번들로 자동 재시도하지 않습니다. 뒤늦은 상태 응답으로 불일치 상태를 해제하지 않습니다.

**단계적 적용:** 현재 `/park`는 이전 서비스 맵입니다. CONNECTED에 map이 오면 기존 서비스 identity의 세 필드와 비교한 뒤 그 identity를 요청에 넣습니다. map이 없는 기존 서버에는 **기존 요청 형식을 유지해 map 필드를 보내지 않습니다**. 기존 Java TableProtocol이 추가 필드를 거부하기 때문입니다. 새로운 schemaVersion 2 identity를 지정한 런타임은 map 누락도 거부합니다. 서비스 맵 전환 때 생성된 세 상수를 런타임에 지정하고 `requireMapMetadata:true`로 통일해야 합니다. 버전 상수만 새 것으로 바꾸고 기존 맵을 표시하면 안 됩니다. BE는 CONNECTED.map 제공과 함께 CHANNEL_JOIN/GAME_RECONNECT_CHECK의 필드 검증도 map을 허용하도록 연결해야 합니다.

## 7. 다음 연결과 검증

1. BE에서 schemaVersion 2 물리 데이터·시설 데이터·요청/오류 필드 위치 검토.
2. FE 실제 서비스 장면·좌석/시설 앵커·내비게이션을 새 공통 설정으로 전환하고 생성 버전을 연결. 현재 서비스 시설 화이트리스트도 신규 시설 카탈로그에 맞춰 전환.
3. BE에서 JSON 어댑터, 기존 tableId 매핑, 시설 카탈로그, 스폰/수영, CONNECTED 및 입장·복구 버전 비교 연결.
4. 같은 JSON·manifest로 계단/다리/전망대·좁은 통로·수영·좌석·퇴장·스폰과 새로고침/재접속/구버전 접속을 통합 검증한 뒤 함께 배포.

이번 FE 검증은 생성 데이터와 네트워크 계약 테스트입니다. **실제 Java 물리 엔진에서의 통행·착지 결과까지 검증한 것은 아니며, 통합 검증이 배포 전 필수입니다.**
