# 180m 공원 생성 데이터 연결 요청 — BE·CI 담당자 전달용

작성일: 2026-10-26

BE 회신과 테이블 16개 운영 결정을 반영했습니다. 이번 추가 데이터의 상세 값·판정식과 바로 전달할 채팅 문구는 [PARK_BACKEND_CONFIRMATION.md](PARK_BACKEND_CONFIRMATION.md)를 참고해 주세요.

## 요청 요약

FE에서 180×180m 공원의 공통 설정과 서버용 JSON 생성 도구를 준비했습니다. 기존 Java 이동·충돌 판정은 유지하면서 생성 데이터를 서버의 물리 형상·테이블 좌표·시설 이용 위치에 연결해 주세요. 빌드·CI·배포 연결은 BE 및 해당 인프라 담당자가 진행하는 범위로 요청드립니다.

FE 담당자는 Java·DB·서버 리소스·공용 CI를 직접 수정하지 않습니다. 앞서 시도했던 통합 커밋 `515a689`는 `11ccdf7`로 취소했습니다. 해당 커밋의 Java 로더나 CI 변경을 적용 완료된 구현으로 보지 말아 주세요. 확정 미리보기와 FE 생성 도구는 유지하며, 새 맵 FE 연결은 명시적 모드에서 제공하며 기본 서비스 전환은 BE 공동 검증 후 진행합니다.

맵 버전 확인은 최신 `dev`의 **`WORLD_MAP_CONFIRM` → `WORLD_MAP_STATE` 방식에 맞추는 방향**으로 요청합니다. 기존 `CHANNEL_JOIN`·`GAME_RECONNECT_CHECK`에 `map`을 추가하자는 이전 제안은 철회합니다. 현재 FE는 이 절차를 구현했습니다. 새 장면·생성 identity 연결은 `park-integration` 모드로 제공하며 [FE 실행·검증 안내](PARK_FE_INTEGRATION.md)를 기준으로 테스트 서버와 맞춥니다.

## 1. 전달 파일과 현재 상태

브랜치: `feat/park-180-layout-preview`

- `frontend/generated/park/server-map.json`: schemaVersion 2 배치·테이블·로컬 좌석·시설 Pose·무확장 3D 충돌·지형 데이터.
- `frontend/generated/park/manifest.json`: 같은 identity, 입력 지문, 생성 파일 체크섬과 바이트 수.
- `frontend/docs/PARK_BE_HANDOFF.md`: 데이터 필드와 좌표 의미.
- `frontend/docs/PARK_GENERATION.md`: FE 생성·검사 방법.

기존 FE 보강 기준은 `e88561a`이며, BE 추가 요청에 따라 익명 메모함·전망대·디딤돌 보조 데이터를 추가했습니다. 현재 생성 버전은 다음과 같습니다. 향후 변경 시에는 전달하는 JSON·manifest에 기록된 실제 값을 사용해 주세요.

```json
{"mapId":"park","schemaVersion":2,"mapVersion":"5ce3cff53136eaa3be6a9fe3048d49f611403c1ceff41d2c8f266e26cc6ac840"}
```

현재 생성물은 테이블 16개·로컬 좌석 64개, 벤치 74개·운동기구 12개·망원경 2개, 3D 박스 2,024개·볼록 형상 34개·메시 8개를 포함합니다. 개수는 현시점 확인용이며 향후 로더의 고정 상수로 사용하지 않습니다.

현재 실제 `/park`는 이전 서비스 맵입니다. `metadata.stage: preview`, `semantics.scope: park-preview`와 manifest의 미연결 상태도 현재 전환 전 상태를 표현합니다. 실제 서비스 전환 때 FE에서 해당 메타데이터를 정리·재생성하므로 최종 배포 버전은 다시 전달합니다.

## 2. 역할 구분

| 담당 | 작업 |
| --- | --- |
| FE | 공통 설정, JSON·manifest·버전 생성, 필요한 데이터 필드 보강, `/park` 장면·좌석·시설·미니맵·내비게이션 전환, 최신 버전 확인 프로토콜 연동 |
| BE | 생성 데이터 로딩·검증, 기존 물리 엔진 연결, 기존 서버 tableId 매핑, 시설 카탈로그·이용/퇴장 좌표, 스폰·수영, 실제 로딩 identity 제공·입장/복구 차단 |
| BE·CI/배포 담당자 | 생성물 검사·서버 빌드 리소스 포함, Docker 빌드 입력, 공통 데이터 변경 시 FE/BE 빌드 분류, 개발 환경 동시 전환·배포 |
| FE·BE 공동 | 규격 확정, 작은 위치 변경으로 통합 검증, 실제 인증·재접속·버전 불일치 검사 |

## 3. BE 구현 요청

### 3.1 생성 파일 로딩과 무결성

1. JSON의 `format: ontop.park-map`, `mapId: park`, `schemaVersion: 2`를 확인합니다. 기존 schemaVersion 1 파일과 혼용하지 않습니다.
2. JSON과 manifest의 `mapId/schemaVersion/mapVersion`이 일치하는지 확인합니다. manifest의 `generated/park/server-map.json` 항목에 있는 원본 바이트 SHA-256과 바이트 수를 검증해 주세요. 생성 JSON은 LF가 고정되어 있으므로 전달 중 개행을 바꾸지 않습니다.
3. 검증한 파일 세트를 서버 빌드 리소스에 포함하는 방식으로 요청합니다. 실행 중 서버 핫 리로드는 이번 범위에 요구하지 않습니다. 변경 반영은 재빌드·배포·재시작 기준입니다.
4. 누락·변조·미지원 규격은 시작 또는 빌드 단계에서 명시적으로 실패시켜 주세요. 구형 맵을 조용히 로딩하면서 새 버전만 응답하지 않도록 합니다.

### 3.2 이동·충돌·지형

- 단위 m, Y-up, 북쪽 -Z, yaw는 Y축 라디안입니다. 공원 내부 180×180m를 이동 범위로 사용하고 도로·외곽 건물은 배경입니다.
- **`data.physics`만 서버 3D 물리에 연결합니다.** `data.collision`은 여유 폭이 포함된 FE 미리보기 2D 영역이므로 서버 충돌 형상으로 중복 로딩하지 않습니다.
- `boxes.center/half/yaw`, `meshes.vertices/indices`, `hulls.vertices`를 기존 Java 물리 로더에 연결해 주세요. half는 반치수, vertices는 월드 좌표이며 indices는 0부터 시작합니다. 위치를 다시 더하지 않습니다.
- `playerInflation: 0`, `collisionMargin: 0`입니다. 캐릭터 캡슐과 엔진 margin은 기존 서버 정책을 유지하며 생성물에 이동 여유 폭을 이중으로 더하지 않습니다.
- 지면·바닥·계단·다리 등 `role: surface`도 로딩해야 합니다. `solid`만 로딩하면 지면이 없어집니다.
- 첫 메시 `terrain`은 현재 2m 격자이며 삼각형 순서는 `(a,c,b),(b,c,d)`입니다. 별도 다리·낚시 데크·전망대 형상과 함께 사용합니다. 호수를 덮는 평면 바닥을 추가하지 않습니다.
- 단순화한 물리 프록시이며 모든 장식의 시각 메시가 아닙니다. 점프맵 발판/코인 게임 판정, 카메라 충돌, 산포 식재의 잎·미세 장식은 제외했습니다.

### 3.3 기존 테이블 ID와 좌석

**운영 결정: 테이블 16개 모두 실제 게임용입니다.** 기존 채널당 2개를 유지하고 나머지 14개를 추가하는 연결을 요청합니다.

- `data.tables[].id`의 `table-1`~`table-16`은 FE 앵커 ID입니다. 기존 서버 tableId를 재발급하거나 JSON ID로 덮어쓰지 말고 명시적으로 매핑해 주세요. 채널별 구분도 유지합니다.
- `position`을 새 월드 위치로 사용하고 `seatAnchors`는 테이블 기준 로컬 좌표·기존 순서로 연결합니다. 현재 테이블 yaw는 0입니다.
- 나머지 14개 서버 테이블 등록은 BE의 기존 생성·관리 정책으로 진행해 주세요. 기존 2개 ID는 유지하며 FE에서 신규 서버 ID를 발급하지 않습니다.
- BE 제안대로 기존 **park-bindings.json 형식을 공통으로 사용**합니다. 테이블 API의 bindings 추가 제안은 철회합니다. 채널별 16개 실제 서버 ID를 아래 형식으로 전달해 주세요. FE의 환경별 파일도 같은 매핑으로 맞춥니다. 현재 공개 기본 파일은 비어 있고 개발용 파일에는 기존 2개만 있습니다.

```json
{"bindings":[{"channelId":"<실제 채널>","tableId":"<기존 서버 ID>","anchorId":"table-1"}]}
```

- 착석·퇴장·경기 복구 시 새 앵커와 서버 위치가 일치하도록 연결해 주세요. 서버 관전 허용 거리 **20m는 유지**합니다. 이전 `spectatorRadius: 3.5`는 생성물에서 제거했으며 관전 정책으로 사용하지 않습니다.

### 3.4 벤치·운동기구·망원경 및 시설 위치

- `data.interactions.benches/fitness/telescopes`의 개별 ID를 서버 카탈로그에 연결합니다. 기존 유지 ID는 그대로 사용하고 신규 ID는 배열 순서로 다시 만들지 않습니다.
- 벤치는 `seats[].use/exit`, 운동기구·망원경은 `use/exit`를 제공합니다. `{x,y,z,yaw}` 월드 Pose이며 시설 위치를 다시 더하지 않습니다.
- 이용 Pose의 Y는 기존 서비스의 바닥 +0.8m 원점 관례입니다. 스폰의 캡슐 중심 계산과 구분합니다. 이용 반경·높이 허용치·좌석 점유·서버 승인/해제를 연결해 주세요.
- 소리함은 BE 확인대로 `data.interactions.mailbox`를 사용합니다. 별개인 익명 메모함은 `data.interactions.notes`에 position·reachPosition·반경·높이 기준을 추가했습니다. 상세 판정은 [추가 질문 회신](PARK_BACKEND_CONFIRMATION.md)을 참고해 주세요.

### 3.5 스폰·수영·기존 이동 파라미터

- 스폰은 `data.physics.spawn.position`의 **높이를 포함한 캡슐 중심 좌표**를 사용합니다. 현재 약 `[0,0.84,82]`이며 캐릭터 반높이를 다시 더하지 않습니다. 채널별 스폰 슬롯은 BE 기존 정책으로 안전하게 배치해 주세요.
- 호수 정보는 `data.surfaces.lake`, 다리·접속부·낚시 데크는 같은 `surfaces`의 해당 항목과 3D 형상을 참고합니다. 수영 상태 전환·부력·다리/디딤돌 복귀를 기존 Java 동작에 연결해 주세요.
- `data.physics.tower`에 중심·내외측 반경·높이·회전 수와 바닥 높이를, `data.physics.steppingStones`에 개별 hull의 위치·전체 폭/깊이·상단 높이를 추가했습니다. 기존 보조 이동 판정에 연결해 주세요. `movement/swimming/telescope` 묶음은 추가하지 않았으므로 해당 설정은 기존 서버 정책을 유지합니다.

## 4. 최신 dev 버전 확인 절차 유지 요청

확인 기준은 `dev`의 `08360a1`과 `docs/world-map-api.md`입니다. 아래는 새 생성 맵 연결 후의 목표이며 현재 FE 브랜치가 이미 이 절차를 지원한다는 뜻은 아닙니다.

```text
CONNECTED(payload.map, mapVerificationRequired)
  → FE: WORLD_MAP_CONFIRM(payload에 mapId/schemaVersion/mapVersion)
  → BE: WORLD_MAP_STATE(payload.map, verified: true)
  → 기존 경기 복구·채널 입장 진행
```

```json
{"type":"WORLD_MAP_CONFIRM","payload":{"mapId":"park","schemaVersion":2,"mapVersion":"<FE 번들에 포함된 생성 버전>"}}
```

- `CONNECTED`와 `WORLD_MAP_STATE`는 **서버가 실제 로딩한 생성 JSON의 최상위 identity**를 반환해 주세요. 내부 물리 어댑터가 schemaVersion 1 구조를 사용하더라도 외부에는 생성 파일의 2를 전달해야 합니다.
- FE는 서버 값을 그대로 복사해 확인 요청을 보내지 않습니다. 자신이 표시하는 맵의 생성 identity와 비교합니다.
- `CHANNEL_JOIN`은 기존 `{channelId}`, `GAME_RECONNECT_CHECK`는 기존 요청 형식을 유지하는 방향입니다. 이 두 요청에 map 필드를 추가하도록 BE를 변경해 달라는 요청은 철회합니다.
- 오류는 최신 dev의 `MAP_VERSION_MISMATCH`·`MAP_VERSION_REQUIRED`, 맵 정보 위치는 **`payload.serverMap`**을 유지해 주세요. 이전 `payload.map` 오류 제안은 철회합니다.
- 확인 전 입장·자동 경기 복구·시설 이용 및 관련 상태 전달을 차단하고, 재접속마다 새로 확인합니다. FE는 실패 시 새로고침·수동 재접속을 안내합니다.
- `WORLD_MAP_REQUIRE_MATCH` 활성화 시점은 FE 연동 완료 후 함께 정합니다. 기존 따라가기·감정표현 취소·경기 영속화 작업은 유지해 주세요.

## 5. CI·빌드·배포 담당자 요청

다음은 적용 요청이며 현재 브랜치에 이 CI/서버 빌드 변경이 남아 있다는 뜻이 아닙니다.

1. CI에서 `frontend`의 `pnpm map:check`를 **자동 생성하는 FE build보다 먼저** 실행해 오래된 생성물을 검출합니다.
2. Java 빌드 시 JSON·manifest 검증과 리소스 포함을 연결합니다. 가능하면 입력 소스 지문도 검사해 주세요. Java에 FE의 생성 계산 로직을 중복 구현하지 않습니다.
3. Docker가 두 파일을 포함하도록 빌드 컨텍스트·COPY 경로·실행 위치를 검토해 주세요. 구체적인 방식은 기존 인프라 담당자가 결정합니다.
4. 공통 맵 설정·참조 설정·생성 데이터 변경 시 FE와 BE 양쪽을 검사·빌드하도록 변경 감지 규칙을 연결합니다. 기존 인프라 수동 검토 게이트는 유지합니다.
5. 이전 맵 고정 테스트 외에 **새 생성 데이터를 실제로 읽는 Java 테스트**를 필수로 실행합니다. 구형 fixture 테스트 통과만으로 새 맵 연결을 완료 처리하지 않습니다.
6. 동일 생성물의 FE·BE를 개발 환경에서 함께 전환하고, 구버전 혼용 시 차단과 복구 안내를 확인합니다. 문제 발생 시 이전 FE·BE 세트를 함께 복구합니다.

## 6. 남은 전달·조율 항목

1. schemaVersion 2의 3D 형상·시설 Pose가 기존 Java 로더에 연결 가능한지, 추가로 필요한 필드와 형식.
2. park-bindings.json 공동 사용을 위한 채널별 16개 실제 서버 ID·앵커 매핑 목록과 파일 반영 시점.
3. WORLD_MAP_CONFIRM 유지에는 양쪽 동의했습니다. 추가 오류 응답 등 변경이 있으면 FE에 전달 부탁드립니다.
4. 추가한 notes/tower/steppingStones 필드의 연결 가능 여부와 보완할 점.
5. 로딩·시설·CI 담당 및 개발 환경 전환 시점. FE가 `/park` 전환 검증을 시작할 수 있는 조건.

후속 FE 작업에서 생성 필드 보강·버전 확인·새 맵 장면·시설·내비게이션·전달 매핑을 연결했습니다. 기본 서비스 전환은 테스트 서버 공동 검증 후 진행합니다.

## 7. 공동 완료 기준

| 검사 | 확인할 결과 |
| --- | --- |
| 기준 맵 | 실제 로그인, 화면·서버 위치, 이동·계단·다리·전망대·시설 이용/퇴장·스폰·수영 일치 |
| 작은 변경 | 테스트용으로 테이블 하나와 장애물 하나 이동 → 재생성·재빌드 후 화면·좌석·서버 충돌·20m 관전 경계·버전 함께 변경 |
| ID 유지 | 위치가 바뀌어도 기존 서버 tableId·시설 ID·좌석 인덱스 유지 |
| 버전 오류 | 서로 다른 버전·스키마·누락·확인 전 요청·재접속에서 입장/복구 차단 및 안내 |
| 회귀 | 따라가기·감정표현·경기 시작/복구·기존 서버 판정 유지 |
| CI/배포 | 오래된 생성물은 실패, 올바른 JSON 세트는 빌드에 포함, 같은 버전으로 FE·BE 전환 |

작은 변경 검증은 전용 테스트 배치에서 진행하고, 확인 후 확정 배치를 복원합니다. 취소한 통합 커밋의 검증 결과를 이 새 연결의 완료 근거로 사용하지 않습니다. 현재 상태는 **FE 생성·새 맵 모드 연결·자체 계약 검증 완료**입니다. BE는 로컬 자동 테스트와 새 맵 실행 설정 머지를 완료했다고 회신했습니다. 실제 접속 서버 주소·실행 방법·채널/매핑 전달 후 공동 검증과 기본 서비스 전환을 진행합니다. CI·배포는 담당자와 조율합니다. [FE 실행 안내](PARK_FE_INTEGRATION.md)를 기준으로 이어갑니다.
