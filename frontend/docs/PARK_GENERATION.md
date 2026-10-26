# 180m 공원 JSON·맵 버전 생성

공통 설정에서 서버 전달용 JSON과 FE 미리보기 버전을 함께 생성한다. Java/DB/실제 서비스 맵과 `src/config/mapVersion.ts`는 변경하지 않는다. 아직 서버 연결 전인 180m 미리보기용 데이터이며, 실행 중인 BE 좌표를 자동으로 갱신하는 기능은 아니다.

## 실행

`frontend`에서 Node 24와 기존 의존성을 사용한다. 새 패키지를 설치하지 않는다.

```sh
pnpm map:generate   # 세 생성물을 함께 갱신
pnpm map:check      # 누락/오래된 파일/변조가 있으면 종료 코드 1, 파일 수정 없음
pnpm dev:layout    # 시작 시 생성, 관련 설정 수정 시 재생성 후 미리보기 새로고침
pnpm build         # 빌드 앞에서 자동 생성
```

생성물 세 파일을 소스 변경과 함께 커밋한다. `map:check`는 자동 복구하지 않으므로 CI에서는 **build보다 먼저** 실행한다. 기존 CI 파일을 새로 만들거나 BE 파이프라인을 수정하지 않았다.

| 생성 파일 | 용도 |
| --- | --- |
| `generated/park/server-map.json` | 버전·좌표 규약·시설/테이블/좌석·충돌·바닥/수영 파라미터 |
| `generated/park/manifest.json` | 같은 버전, 입력 소스 지문, 생성 파일 체크섬/바이트 수, 데이터 개수, 검증 상태 |
| `src/map/park/generated/mapVersion.ts` | FE가 읽는 `PARK_MAP_VERSION`, 맵 ID, 스키마 버전 |

생성 파일은 직접 편집하지 않는다. Git attributes로 LF를 고정한다. `manifest.json`은 파일 세트의 마지막 기록이며, 배포·전달 전 `map:check`가 통과한 세트를 사용한다. JSON은 `public/`이나 BE 리소스 디렉터리에 복사하지 않는다. 서버로 전달할 파일은 첫 번째와 두 번째 파일이다.

## 버전 계산과 재현성

버전은 임의 증가 번호가 아닌 **64자리 SHA-256**이다. 동일한 데이터와 입력 소스에서는 바이트까지 동일한 생성물이 나온다. 시간·PC 이름·절대 경로·Git 작업 경로를 넣지 않는다.

1. 공통 데이터의 객체 키를 정렬해 canonical JSON을 만든다. 배열 순서(좌석 인덱스/ID 등)는 유지한다. 숫자는 JSON number이며 임의 반올림하지 않는다.
2. 실제 맵 계산에 사용된 `src/map`·`src/config`의 TypeScript 모듈을 기존 Vite로 묶어 읽는다. 입력 파일은 LF로 정규화하고 frontend 기준 상대 경로/내용 SHA-256을 기록한다. 생성된 버전 모듈은 입력 그래프에 넣지 않는다.
3. `dataHash`와 `sourceHash`를 계산한다. `format/schemaVersion/mapId/hashAlgorithm/hashes/semantics`의 canonical JSON을 다시 SHA-256해 `mapVersion`을 정한다.
4. 같은 `mapVersion`을 서버 JSON, 검증 명세, FE 상수에 기록한다. 서버 JSON과 FE 상수 파일의 원본 바이트 체크섬은 manifest에 기록한다.

이 방식은 좌표/충돌 값뿐 아니라 이동 높이·물 판정 로직과 참조 메타데이터의 변경도 감지한다. 입력 그래프에 포함된 파일의 주석 변경이나 이름 변경에도 버전이 바뀔 수 있다. 공통 설정 밖의 순수 모델 외형·UI 변경은 이 버전의 범위가 아니다.

입력 소스의 내용과 컴파일에 사용한 내용이 일치하는지 확인한다. 생성 중 소스가 다시 바뀌면 실패시켜 혼합 결과를 기록하지 않는다. 검사가 성공한 입력만 세 파일의 임시 파일을 준비한 뒤 교체한다. 동일 결과는 다시 쓰지 않는다.

## 개발 중 자동 갱신

`park-map-vite-plugin.ts`는 **layout-preview 모드에서만** 동작한다. 시작 시 생성하고, manifest에 기록된 공통 설정/참조 메타데이터 파일이 바뀌면 작업을 순서대로 실행한다. 결과를 갱신한 뒤 화면 전체를 새로고침하므로 정적 지형 배치와 표시 버전을 함께 읽는다. 미리보기 왼쪽 아래에 버전 앞 12자리를 표시하고, 전체 값은 해당 요소의 title과 main의 `data-map-version`에 둔다.

유효하지 않은 좌표/중복 ID 등으로 생성이 실패하면 마지막 정상 JSON/버전을 유지하고 개발 오류를 표시한다. 설정을 고치고 저장하면 다음 작업에서 복구한다. 수동 생성과 개발 감시 작업은 frontend의 `.park-map-cache/generation.lock`으로 쓰기 순서를 조정한다. 이 캐시 디렉터리는 Git에서 제외한다.

일반 서비스 개발 모드에는 이 감시 동작을 적용하지 않는다. FE 실제 서비스가 아직 이전 맵을 쓰므로 `EXPECTED_MAP_VERSION`을 새 값으로 바꾸지 않는다. 향후 서비스 전환 시 새 배치와 서버 로딩을 같이 적용한 뒤 새 버전 상수를 사용해야 한다.

## 서버 JSON 형식과 BE 연결 사항

최상위 필드:

```json
{
  "format": "ontop.park-map",
  "schemaVersion": 2,
  "mapId": "park",
  "mapVersion": "64자리 SHA-256",
  "hashAlgorithm": "sha256",
  "hashes": { "dataHash": "...", "sourceHash": "..." },
  "semantics": { "scope": "park-preview", "authority": "frontend-review-data" },
  "data": { "metadata": {}, "world": {}, "facilities": [], "pavilions": [], "tables": [], "interactions": {}, "paths": [], "perimeter": {}, "fences": {}, "collision": {}, "physics": {}, "surfaces": {} }
}
```

위 예시는 구조 요약이며 전체 필드는 생성 JSON이 기준이다. 좌표와 충돌의 자세한 의미는 [PARK_COMMON_SETTINGS.md](./PARK_COMMON_SETTINGS.md)를 함께 참고한다.

BE 개발자가 이어서 연결할 부분:

1. `format/schemaVersion/mapId`를 확인하고 서버 JSON을 읽는 어댑터를 연결한다. 현재 schemaVersion은 **2**이며 1과 호환되지 않는다. manifest와 JSON의 mapVersion 및 체크섬이 일치하는 세트를 사용한다.
2. `data.tables`의 화면 `id`를 기존 DB tableId에 매핑해 `position`을 적용한다. 좌석은 테이블 기준 `seatAnchors`이며 순서/인덱스를 유지한다.
3. **`data.physics.boxes/meshes/hulls`**를 기존 Java 3D 충돌 로더에 연결한다. 좌표는 월드 좌표, boxes.half는 반치수다. 캐릭터 반경/이동 여유 폭/margin은 생성 데이터에 더하지 않았다. 서버의 기존 캡슐과 margin 처리는 BE에서 담당한다.
4. `data.interactions.benches/fitness/telescopes`의 ID·이용/퇴장 Pose, `data.physics.spawn`의 캡슐 중심 좌표, `data.surfaces.lake`의 수영 파라미터를 연결한다.
5. 서버 실제 로딩 identity를 `CONNECTED.payload.map`으로 보낸다. FE는 입장/복구 요청에 `payload.map`을 넣으며 `MAP_VERSION_MISMATCH` 오류와 새로고침·재접속 안내를 처리한다. 요청/오류 map 위치와 schemaVersion 2의 최종 합의는 BE 연결 전에 확인한다.

`semantics`는 해석 규칙의 일부다. **`data.collision`은 기존 미리보기용 2D 영역**으로 여유 폭이 이미 반영되어 있으므로 서버 물리에 사용하지 않는다. `data.physics`만 서버용 무확장 3D 프록시다. 지형 첫 메시는 정규 격자이며 다리/바닥/계단은 별도 형상이다. 시각 모델 전체를 삼각형으로 추출한 정밀 메시가 아니며, 산포 식재/미세 장식/카메라/점프 게임 판정은 제외한다.

테이블 좌석은 로컬 좌표다. 시설 use/exit는 `{x,y,z,yaw}` 월드 Pose이고 기존 서비스의 +0.8m 원점 관례를 유지한다. 스폰은 별도로 캡슐 중심 기준이다. `spectatorRadius`는 생성물에서 제거했으며 서버 관전 거리 20m를 유지한다. 형식·범위·네트워크 전환 조건 전체는 [PARK_BE_HANDOFF.md](./PARK_BE_HANDOFF.md)를 기준으로 한다.

현재 `/park`는 이전 맵이므로 새 생성 버전으로 표시하지 않는다. 기존 서버의 map 누락은 전환 전 호환 경로로 처리하며 요청에 map을 추가하지 않는다(기존 Java의 엄격한 필드 검증 유지). CONNECTED.map이 제공되면 세 필드를 비교하고 요청에 map을 보낸다. schemaVersion 2 identity를 사용하는 새 런타임에서는 map 누락도 거부한다. 실제 서비스 장면·시설 카탈로그·내비게이션 전환과 생성 identity 주입은 BE 준비 후 함께 진행한다.

## 검증

- `parkMapGeneration.test.ts`: 동일 입력/키 순서 재현성, 위치/계산 소스 변경 시 버전 변경, JSON/FE/manifest 일치, 체크섬, 비정상 JSON 거부, 읽기 전용 검사, 생성 잠금·작업 오류 복구.
- `parkMapWatcher.test.ts`: 임시 프로젝트에서 실제 설정 저장 → 버전/좌표 갱신 → 잘못된 설정 저장 시 정상 결과 보존 → 수정 후 복구, CRLF/프로젝트 경로 차이, CLI 검사 실패/복구와 종료 코드.
- `parkPhysics.test.ts`: 2D 여유 폭 변경과 3D 원본 형상 독립성, 정규 격자/삼각형 방향/인덱스, 수면 아래 지형, 4방향 계단, 시설 이동·ID·퇴장 방향·캡슐 중심 스폰.
- `mapContract.test.ts`, `mapAdmissionRuntime.test.ts`: 실제 소켓 경로의 CONNECTED 비교, 입장/복구 identity 전송, 오류 차단, 늦은 스냅샷 무시, 재접속 시 재검사. `map-contract.spec.ts`는 안내·버튼을 브라우저에서 검증한다.
- 배치 브라우저 검사에서 표시 버전과 서버 JSON 버전의 일치, 기존 산책/수영/점프/모델 동작을 확인한다. Browser plugin not available: 기존 Playwright/Edge로 검증한다.
