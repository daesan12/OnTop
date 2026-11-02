# 새 맵 시설 등록 보강 — BE 전달용

기준: 2026-10-28, `feat/park-180-layout-preview`의 로컬 변경. 실제 BE 연동·배포 전이다. 맵 버전·바이트 수·체크섬은 같은 생성 세트의 `generated/park/manifest.json`을 기준으로 한다.

## 게임 테이블: 18개·72석

기존 `table-1`~`table-16`의 앵커·좌석·서버 ID 매핑을 유지한다. VR 돌 탁자 두 곳은 게임용으로 추가했다.

| FE 앵커 | 기존 외형 ID | 월드 위치 X/Y/Z | 서버 ID |
| --- | --- | --- | --- |
| `table-17` | `layout-vr-stone-set-1` | `[-53, 0.1, -8]` | BE 발급·매핑 추가 필요 |
| `table-18` | `layout-vr-stone-set-2` | `[-53, 0.1, 2]` | BE 발급·매핑 추가 필요 |

각 테이블의 로컬 좌석은 순서대로 `[0,0,1.8]`, `[0,0,-1.8]`, `[-2,0,0]`, `[2,0,0]`이다. 앞뒤 두 의자 위치는 유지하고 양옆 의자를 보강했다. 2인/4인 게임의 기존 좌석 표시 규칙을 사용한다. 테이블 위치의 Y=0.1은 VR 뜰 바닥 높이이며 좌석 Y는 테이블 로컬 좌표다. 실제 이용자 Pose는 기존 게임 좌석 변환 규칙으로 계산한다.

현재 `docs/integration/park-180/park-bindings.*.json`과 `frontend/public/park-bindings.generated.*.json`은 BE가 전달한 기존 16개 기준을 유지한다. 임의 서버 ID를 만들지 않았다. BE에서 채널마다 신규 두 앵커를 실제 서버 ID에 매핑하고, 인프라 담당자가 동일 규격 파일을 환경별 생성 맵 매핑 URL에 배포한다. 기존 FE의 매핑 로더를 사용하며 서버 ID를 FE 코드에 하드코딩하지 않는다. 브라우저 테스트 fixture에만 `fixture-table-17/18`이라는 가상 ID가 있으며 배포 매핑으로 사용하면 안 된다.

## 벤치: 71구역·142석

기존 68개 벤치 ID·좌석·퇴장 Pose는 유지하며 다음 3개를 추가한다. 각 벤치는 2석이고, 이용·퇴장 Pose와 3D 물리 형상은 생성 JSON을 사용한다.

| 신규 ID / siteId | 바닥 기준 위치 X/Y/Z | yaw | 퇴장 X/Y/Z |
| --- | --- | --- | --- |
| `bench-forest-southwest` | `[-73,0,80]` | `0` | `[-73,0.8,81.5]` |
| `bench-forest-northeast` | `[52,0,-73]` | `0` | `[52,0.8,-71.5]` |
| `bench-forest-southeast` | `[74,0,73]` | `0` | `[74,0.8,74.5]` |

`data.interactions.benches`에서 읽고 기존 `BENCH` 계약으로 catalog/이용/퇴장에 연결한다. 문자열 ID를 배열 순서로 재생성하지 않는다.

분수 벤치 `bench-76`~`bench-79`는 기존 이용·퇴장·물리 위치에 맞춰 FE 외형만 복원했다. 미리보기 2D 수조 충돌은 원형으로 보정했고 서버용 3D 수조 형상은 그대로다. 운동마당의 4개 원형 벤치 구역도 유지한다.

포토부스 내부 촬영 벤치는 이번에는 이용하지 않는다. 벤치 착석 목록에 추가하지 않았다.

## 상점·응모부스·포토부스: 공사 안내만 제공

기존 시설 ID `layout-shop`, `layout-drink`(응모부스), `layout-photo`를 유지한다. `data.interactions.construction`에 다음 정보를 추가했다.

- `id`, `kind: "CONSTRUCTION"`, `status: "construction"`, `label`, `message`
- `position`: 건물 기준 좌표, `reachPosition`: 입구의 이용자 기준 좌표
- `yaw`, `radius: 3`, `heightTolerance: 0.7`

FE는 거리·높이·이용 상태를 확인한 뒤 E/클릭으로 **공사 중 안내창만** 연다. 구매·응모·촬영 API와 `WORLD_FACILITY_USE`는 호출하지 않는다. 새 맵 모드의 기존 상점 메뉴도 구매 화면 대신 같은 안내로 연결했다.

이 목록은 FE 안내용 부가 데이터다. BE는 로딩 시 해당 부가 필드를 허용/무시하면 되며, 기존 `BENCH/FITNESS/TELESCOPE` catalog에 `CONSTRUCTION`을 추가할 필요는 없다. 건물의 기존 충돌은 유지한다.

## BE 확인 요청

1. 같은 버전의 `server-map.json`·`manifest.json`을 로딩하고 신규 부가 필드 허용 여부 확인.
2. 채널별 실제 게임 테이블을 18개로 구성하고 `table-17/18` 서버 ID 매핑 추가. 기존 16개 서버 ID 유지.
3. 숲 벤치 신규 3개를 기존 시설 catalog 및 이용·퇴장 판정에 연결.
4. 기존 Java 판정·관전 20m·`WORLD_MAP_CONFIRM`·맵 버전 불일치 계약 유지.
5. 접속 환경과 최신 매핑을 FE에 전달한 뒤 실제 로그인·이동·충돌·18개 테이블·벤치 이용·수영·스폰·버전 차단을 공동 검증.

이번 작업은 FE·공통 설정·생성물·문서 변경이며 Java·CI·인프라·실제 배포 설정은 수정하지 않았다.
