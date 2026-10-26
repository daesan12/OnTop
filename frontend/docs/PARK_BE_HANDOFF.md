# 공원 맵 생성 데이터 · BE 연결 계약 (schemaVersion 2)

현재 브랜치 `feat/park-180-layout-preview`에서 schemaVersion 2 생성 데이터의 Java 로딩·좌표·시설·버전 검사와 FE `/park` 전환을 함께 구현했습니다. 실제 배포는 같은 생성물을 포함한 FE·BE를 함께 적용해야 합니다.

## 전달 파일

- `frontend/generated/park/server-map.json`: 배치, 테이블·로컬 좌석, 시설별 이용 정보, 서버용 3D 형상과 지형 메시
- `frontend/generated/park/manifest.json`: 동일 맵 버전, 파일 체크섬, 입력 소스와 개수
- `frontend/docs/PARK_GENERATION.md`: 생성·검사 방법과 해석 규칙

최신 보강 작업은 `e88561a`로 커밋·푸시했습니다. 후속 통합 변경도 같은 브랜치에서 관리합니다. schemaVersion 1 생성물과 혼용하지 않습니다.

## 1. 원본과 갱신

공통 배치: `frontend/src/map/park/definition.ts`
계산: `resolve.ts`, `lake.ts`, `interactionData.ts`, `physics.ts`

```sh
cd frontend
pnpm map:generate
pnpm map:check
```

동일 입력에서는 동일 JSON과 SHA-256 맵 버전이 생성됩니다. 미리보기 설정 저장·FE 빌드에도 연결되어 있습니다. 생성 파일을 직접 수정하거나 BE 리소스에 수동 좌표를 중복 입력하지 않습니다. 실행 중 서버 핫 리로드는 제공하지 않습니다. 서버 JSON은 빌드 시 JAR에 포함되므로 변경 후 재빌드·재시작합니다.

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
- `GeneratedParkMap`과 `ParkScene`이 기존 Java BoxCollisionShape / MeshCollisionShape / HullCollisionShape 로더에 연결합니다. 기존 캐릭터 캡슐과 0.02m shape margin을 유지하며 **추가 이동 여유 폭을 중복 적용하지 않습니다.**
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

현재 기본값은 약 `[0,0.84,82]`이며 Y는 지면/보행 바닥 높이 + radius(0.3) + halfHeight(0.48) + offset(0.02) + groundClearance(0.04)입니다. 지형 높이를 포함한 값이므로 서버에서 캐릭터 반높이를 다시 더하지 않습니다. 채널별 여러 스폰 슬롯 배치는 기존 Java 정책을 유지해 중심 주변에 연결했습니다. 물속 스폰은 생성 검증에서 거부합니다.

## 6. 버전 전달과 불일치

BE 제안대로 `CONNECTED.payload.map`에 **실제로 로딩한 데이터의** 다음 세 값을 전달합니다.

```json
{"mapId":"park","schemaVersion":2,"mapVersion":"<64자리 SHA-256>"}
```

FE 입장·복구 요청은 동일 구조를 `payload.map`에 담도록 구현했습니다.

```json
{"type":"CHANNEL_JOIN","payload":{"channelId":"...","map":{"mapId":"park","schemaVersion":2,"mapVersion":"<FE에 포함된 버전>"}}}
```

`GAME_RECONNECT_CHECK` 요청에도 같은 `map`을 넣습니다. 소켓 재접속 시 CONNECTED를 다시 확인하고 CHANNEL_JOIN부터 진행합니다. BE는 입장 및 상태 복구 **이전**에 비교합니다. `TableHub`는 일치 확인 전 게임 재접속 자동 복구를 보류합니다. 맵 확인 전 요청도 차단합니다.

불일치 오류의 서버 맵 정보도 `payload.map`입니다. Java 응답과 FE 처리를 이 형식으로 연결했습니다.

```json
{"type":"ERROR","requestId":"<원 요청 ID>","payload":{"code":"MAP_VERSION_MISMATCH","message":"맵 버전이 다릅니다.","map":{"mapId":"park","schemaVersion":2,"mapVersion":"<서버 로딩 버전>"}}}
```

FE는 불일치 시 입장·이동·시설 이용을 멈추고 기존 상태를 정리한 뒤, 페이지 새로고침과 수동 재접속 버튼을 제공합니다. 같은 오래된 번들로 자동 재시도하지 않습니다. 뒤늦은 상태 응답으로 불일치 상태를 해제하지 않습니다.

현재 `/park`는 생성 identity를 사용하며 map 누락도 거부합니다. 기존 서버와 새 FE 또는 새 서버와 기존 FE를 혼용하면 입장할 수 없습니다. FE는 `src/park/mapConfig.ts`로 새 위치·시설 카탈로그·미니맵·길찾기를 사용하고, 서비스 장면은 확정 미리보기의 코드 모델을 재사용합니다.

## 7. 연결된 구현과 남은 배포 확인

- Java 로딩: GeneratedParkMap → ParkScene/WorldPhysics. 2D collision은 읽지 않습니다. 수영의 디딤돌 오르기 보조 정보도 생성 hull 경계에서 연결합니다.
- 테이블: 기존 채널명과 anchorId의 UUID 생성 규칙을 유지합니다. 기존 table-1/2 서버 ID를 유지하고 16개 앵커를 등록합니다. GET /api/v1/tables의 bindings에 {channelId,tableId,anchorId}를 보내 FE가 명시적으로 연결합니다. DB에 임의 좌표나 새 ID를 기록하지 않습니다.
- 좌석: TABLE_JOIN 시 로컬 앵커에 고정하고 TABLE_LEAVE 시 이전 위치로 복귀합니다. 관전 거리는 WorldProximity의 기존 20m 정책을 유지합니다.
- 시설: WorldFacilityService는 생성 ID와 use/exit를 읽습니다. 우체통·소리함의 서비스 위치도 생성 데이터로 연결합니다.
- 빌드: Gradle verifyParkMap/processResources와 Jenkins의 공통 데이터 검사·양쪽 빌드 분류, Docker 루트 컨텍스트를 연결했습니다.
- 검증: parkMapTest는 실제 Java 충돌·좌석·관전 거리·버전 차단·스폰/수영을 검사합니다. map:verify-flow는 원본과 테이블·장애물 임시 이동 양쪽에서 실제 FE 브라우저까지 확인하고 배치를 복원합니다.

배포 전에는 같은 커밋의 FE·BE를 적용하고 실제 인증·실채널에서도 시설 이용/퇴장, 계단·다리·전망대, 좁은 통로와 다중 사용자 재접속을 확인합니다. 로컬 테스트는 주요 경로 검증이며 모든 모델 표면의 전수 검사나 운영 배포 완료를 뜻하지 않습니다. Docker 이미지 빌드와 원격 Jenkins 실행·배포는 별도 환경에서 확인해야 합니다.

재현 명령과 테스트 fixture 구분은 [PARK_GENERATION.md](PARK_GENERATION.md)를 참고합니다.
