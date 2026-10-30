# 새 공원 FE 보완본 · BE 연결 요청

> 최신 재전달본: [PARK_BACKEND_CONNECTION_REQUEST_2026-10-30.md](PARK_BACKEND_CONNECTION_REQUEST_2026-10-30.md). `18225121`의 `PARK_V1` 및 잔여 접촉 지지 제외, 배포 순서를 반영한 최신 문서를 우선 사용한다. 아래는 이전 전달 기록이다.

## 기준과 담당 범위

- 최신 GitLab `dev` 기준: `5a0e5b8a` (2026-10-30 확인). 최종 MR에서는 대상 dev가 갱신되지 않았는지 다시 확인한다.
- mapId: `park`, schemaVersion: `2`.
- 전달 mapVersion: `f79fb6c1861c791f80c28dc813c3ab2264822060e2bec6204655261fc12b7748`.
- 현재 dev 원본 맵 버전: `cac3cb040a43630b0b40201ab089a4b328146c03211867b2a155d2b3614acc81`.
- 변경 범위는 `frontend/`뿐이다. BE Java, 공용 CI, 인프라 설정은 수정하지 않았다.
- 기존 게임 테이블 18개·좌석·시설 ID·18개 서버 매핑, WORLD_MAP_CONFIRM, 관전 20m 정책을 유지한다.

## FE에서 완료한 내용

1. 달려오는 캐릭터의 실제 표시 이동 속도로 비둘기가 도망가게 복원했다.
2. 9개 팔각정의 전등과 난간을 새 배치에 연결했다. 나무·건물·벤치 모델의 끊어진 구조와 운동마당 타일을 로우폴리 형식으로 보완했다.
3. 구름을 제거하고 낮에는 맑게, 밤에는 이동·시설 식별이 가능하도록 밝기를 조정했다.
4. 가로등 42개 중 광장 5개(lamp-0~4), 호숫가 lamp-36, 숲 벤치 옆 lamp-41의 위치를 보정했다. 광장 받침 Y는 0.14m이며 2D/3D 충돌도 같은 위치를 사용한다.
5. 가구 통과·올라타기 차단과 분수대 올라타기 차단을 FE 예측 물리와 생성 JSON에 구현했다. 이 항목의 실제 서버 판정은 아래 BE 연결이 필요하다.
6. 최신 dev의 정문·광장·추가 나무·점프맵 서비스 기능을 보존했다. 중복된 서비스용 미리보기 코스는 제거했다.

## BE 구현 요청 1: 공통 JSON 로딩

같은 커밋의 `frontend/generated/park/server-map.json`과 `manifest.json`을 함께 로딩하고 실제 로딩한 identity를 전달해 주세요. 이동 반경은 형상에 미리 넣지 않았습니다. 가로등은 기존 box 형식이고 신규 서버 기능 없이 새 좌표를 읽으면 됩니다.

`PreparedParkMap`에서 런타임 데이터로 변환하는 단계에도 신규 정책 메타데이터를 연결해야 합니다. JSON에 필드가 존재하는 것만으로 Java 이동 판정이 해당 정책을 사용하는 것은 아닙니다.

## BE 구현 요청 2: 가구 올라타기 금지

- `data.physics.furniturePolicy`: kind=no-climb, movementHeight=2.5, landing=slide-out, landingHeightTolerance=0.12, exitGap=0.03.
- 기존 `table-N-top`, `table-N-chair-[0-3]` ID는 유지한다. 의자의 동적 활성화와 게임별 2인/4인 전환도 유지해야 한다.
- 걸어서 뚫고 지나가거나 점프로 올라서지 않도록 2.5m 이동 차단 box를 로딩한다. 높은 곳에서 해당 기둥 위로 떨어지는 경우 바깥으로 밀어내고 grounded를 해제한다.
- 참조 구현: `frontend/src/network/furnitureLanding.ts`, `src/map/park/furnitureCollision.ts`.
- 좌석 이용은 기존 서버 lease/좌석 배치로 처리한다. 이동 차단 때문에 앉기·나오기나 비활성 의자 자리가 막히지 않는지 확인해야 한다.

## BE 구현 요청 3: 팔각정 난간 점프

- 난간은 기존 1.22m 유한 높이를 유지한다. 걸어서 통과하는 것은 막되 점프로 넘을 수 있어야 한다.
- `data.physics.pavilionJumpSpeed=7.8`을 팔각정 바닥 위에서 점프하는 경우에만 사용한다. FE 조건은 발 높이와 floor 차이 <0.15m, 중심 거리 <4.5×scale+0.3m이다.
- 서버 권위 이동과 클라이언트 위치 검증 양쪽에 동일하게 반영해야 한다. 일반 지면·전망대·최신 점프맵의 기존 규칙은 유지한다.
- 현재 Java의 일반 점프/검증은 이 신규 메타데이터를 사용하지 않는다. FE만 반영하면 점프가 서버에서 되돌려질 수 있다.

## BE 구현 요청 4: 분수대 진입·정착 금지

- 기존 `fountain-basin` hull ID를 유지한다. 실제 외형 하부 반경은 5.4×1.22=6.588m, 차단 기둥 bottom=-1.1m, top=2.5m이다. 주변 내려가는 광장·계단·벤치 및 외형은 유지했다.
- `data.physics.fountainPolicy`: kind=no-climb, shape=cylinder, landing=slide-out, exitGap=0.03. 캐릭터 반경은 형상에 포함하지 않는다.
- 이동·낙하·복구 시 발 높이가 top+0.12 이하이고 머리 높이가 bottom 이상이며, 중심 거리가 radius+캐릭터 반경+exitGap보다 작으면 수평 바깥으로 밀어낸다. 정확히 중심이면 남쪽(+Z)으로 이동한다. 보정 프레임의 grounded를 해제한다.
- 참조 구현: `frontend/src/network/fountainExclusion.ts`. 숨은 기둥 상단에 착지하거나 내부 복구 후 머무는 것도 막아야 한다.

## 최신 점프맵과의 관계

최신 dev에는 이미 `src/features/jumpmap/`의 서비스 HUD·서버 상태/이벤트 연결·착지 연출·코요테/입력 버퍼가 구현돼 있다. 이 전달본은 해당 구현을 유지한다. BE 진행 요청은 기존 [점프맵 BE 요청서](jumpmap/BE_추가요청_2026-10-30.md)를 기준으로 한다.

코스 전달본은 기존 `frontend/docs/jumpmap/course.generated.json` 및 `course.generated.sha256`으로 통일했다. 107개 일반 발판과 6개 문, 총 113개 순서·충돌체이다. 이전 별도 park-jump 전달안은 사용하지 않는다. mapVersion과 원본 fingerprint도 이번 맵에 맞춰 갱신한다. COURSE_VERSION/RULES_VERSION과 기존 서버 보상 계약은 임의 변경하지 않는다.

## 반영·검증·배포

1. BE 담당자가 위 4개 항목과 새 JSON 로딩을 연결한다. 인프라/공용 CI 변경은 담당자에게 요청한다.
2. 같은 JSON·FE로 통과/점프/높은 낙하/내부 복구, 난간 넘기, 게임별 의자 수와 앉기/퇴장, 수영·스폰·버전 확인을 공동 검증한다.
3. 최신 dev에는 자동 배포 경로가 있으므로 서버 규칙이 연결되지 않은 상태로 FE만 먼저 머지·배포하지 않는다. Java 서버와의 검증 미완료는 단위검사 통과로 대신할 수 없다.
4. 검증 후 같은 커밋·JSON·매핑으로 FE/BE를 전환하고 이전 세트를 함께 복구할 수 있도록 한다.

생성: `pnpm map:generate` → `pnpm jumpmap:export`. 검사: `pnpm map:check`, `pnpm jumpmap:check`. `pnpm build:park`도 두 전달 데이터를 순서대로 갱신한다.

## 앞으로 맵 수정 시 작업 기준

작업 시작 시 `git fetch origin --prune` 후 최신 dev 변경을 병합하고, 최신 map definition 및 생성 버전을 확인한다. 기존 배치·기능을 검토하지 않은 채 과거 작업 파일로 덮어쓰지 않는다. BE/인프라 코드는 수정하지 않고 변경 요청을 MD로 작성한다.

## 검증의 한계

FE 로컬 Rapier 충돌 검사와 브라우저 통신 fixture를 사용한다. 실제 Java 서버의 새 no-climb/점프 정책 반영 및 공동 검증은 아직 완료되지 않았다. 이 항목이 머지·배포 전 확인 조건이다.

## 최종 FE 검사 기록

- 최신 dev `5a0e5b8a` 반영 후 전체 단위검사 1,365개 통과, 기존 선택 검사 4개 스킵.
- 공원 통합 브라우저 검사 23개 통과. 마지막 dev의 게임 흐름 변경 후 해당 파일 16개 검사도 다시 통과(최종 고유 시나리오 30개).
- 앱·테스트 TypeScript, 일반 빌드·새 맵 빌드, map:check·jumpmap:check 통과.
- 테이블 18개·시설·좌석 ID, 기존 정문·광장·추가 나무와 점프맵 서비스 연결을 유지했다.
- 브라우저는 로컬 통신 fixture 기준이며 실제 BE 정책 적용의 증거는 아니다.
