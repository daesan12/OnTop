# 광장 수정 맵 FE·BE 공동 전환 요청 — 2026-10-30

## 전달할 요청문

안녕하세요. 광장 수정 맵의 FE·BE 버전 준비와 코드 검증을 완료해 DEV 환경 공동 전환을 요청드립니다. 시설 좌표 인계와 BE 담당자 조율은 제가 별도로 진행하겠습니다.

배포 기준은 `feat/plaza-lucky-facilities`의 **이 요청문을 포함하는 최종 커밋**입니다. 전달 ZIP의 `release.json.sourceCommit`에 전체 Git SHA가 있습니다. 다른 작업을 병합해 맵 원본이 바뀌면 그 합본에서 다시 생성·검증한 버전을 사용해 주세요.

| 항목 | 확정값 |
|---|---|
| mapId / schemaVersion | `park` / `2` |
| mapVersion | `36f22a29154bba5715ba4d4c51f164512f46890e621b868a21d7c2cf654f6131` |
| server-map.json SHA-256 | `df7eda832e9d9f48d19004534e5fbd5214a9085de76868bf05d05ea47da08270` |
| manifest.json SHA-256 | `ec35b3b01896aff143e93a0a2a7202dfdc416068f80609aefd15626b9d7e142a` |

같은 커밋의 다음 파일을 한 세트로 적용 부탁드립니다.

- BE 맵: `frontend/generated/park/server-map.json`, `manifest.json`
- FE 버전: `frontend/src/map/park/generated/mapVersion.ts`를 포함한 새 공원 빌드
- DEV 테이블 매핑: `docs/integration/park-180/park-bindings.dev.json`과 동일한 `frontend/public/park-bindings.generated.dev.json` — 기존 18개 테이블 ID·앵커와 emotes 유지

FE 빌드는 frontend에서 다음 명령으로 진행하며 출력은 `dist-park`입니다. DEV Vercel 배포는 `vercel.dev.json`을 사용해 주세요.

```bash
VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park
```

BE는 새 버전 디렉터리 `/opt/ontop/maps/36f22a29154bba5715ba4d4c51f164512f46890e621b868a21d7c2cf654f6131/`에 두 JSON을 스테이징하고, 기존 generated-map Compose 구성을 사용해 주세요.

```text
WORLD_MAP_SOURCE=generated
WORLD_MAP_JSON_PATH=/run/ontop/maps/server-map.json
WORLD_MAP_MANIFEST_PATH=/run/ontop/maps/manifest.json
WORLD_MAP_REQUIRE_MATCH=true
```

서버 파일 스테이징·앱 재생성·FE 게시 순서는 `infra/app/PARK_MAP_ROLLOUT.md`를 따라 공동 점검 시간에 한 번의 전환 일정으로 묶어주세요. 파일 복사만으로는 실행 중 BE에 반영되지 않으므로 앱 재생성이 필요합니다. 기존 FE/BE/맵/설정의 호환 세트도 함께 복구할 수 있게 기록 부탁드립니다.

현재 전달 JSON으로 BE 6개 클래스 15개 테스트를 실행했고 실패·스킵 없이 통과했습니다. FE 버전 선택·입장 확인과 시설 배치·점프맵 전달본 등 162개 검사, 브라우저 회귀 6개 및 DEV 매핑 URL을 지정한 정식 새 공원 빌드도 통과했습니다. 결과는 ZIP의 `verification.json`에 있습니다.

전환 후 BE 시작 로그와 FE의 `WORLD_MAP_CONFIRM` 값이 위 버전인지, `WORLD_MAP_STATE.verified=true` 이후 입장되는지 확인 부탁드립니다. 로그인·공원 입장·이동/충돌·18개 테이블·소리함·붕어빵 접근·재접속도 공동 확인하고, 적용 커밋·FE 배포 ID·BE 이미지·맵 버전·완료 시간을 공유해 주세요.

우선 DEV 적용을 요청드립니다. PROD는 운영 채널 매핑과 전환 일정을 따로 확정한 뒤 같은 절차로 진행 부탁드립니다.

## 전달 묶음과 검증 범위

- ZIP은 최종 커밋의 Git 원본 바이트를 담고, `release.json`에 파일별 SHA-256을 기록한다. Windows CRLF와 Linux 파일의 차이를 피하기 위해 전달된 원본 바이트로 검사한다.
- ZIP의 `plaza-coordinates.json`은 같은 맵의 시설·물리·상호작용에서 추출한 좌표 참고자료다. 서버 입력 원본은 `server-map.json`이다. `layout-shop` 돌림판은 비활성 상태로 제외돼 있다.
- schema 1의 `frontend/src/config/mapVersion.ts`는 기존 일반 빌드용이다. 새 공원은 `park-integration` 모드에서 생성된 schema 2 상수를 선택한다. 기존 상수에 새 해시만 덮어쓰지 않는다.
- 실제 새 공원 화면도 검토한 랭킹 보드 모델을 사용한다. 랭킹 데이터 API와 복권 보상은 이번 맵 전환 범위에 포함되지 않는다.
- manifest의 `validation.backendIntegration=pending`은 생성기 기본값이므로 수동 덮어쓰지 않는다. 실행한 BE 검사 결과는 `verification.json`에 기록하며, 실제 계정 공동 검증은 전환 단계에서 진행한다.

## 점프맵 연결 버전

정식 `build:park`의 exporter로 `frontend/docs/jumpmap/course.generated.json`과 `.sha256`도 현재 기본 맵 버전에 동기화했다. 기본 공원 JSON과 별도 계약이며 코스 좌표·`courseVersion=park180-jump-v1`·`rulesVersion=v2`는 유지한다.

- course JSON SHA-256: `1cc6a2635b96ad34366aa45b6b9a5da1add93f84808d5ed87975a1ea00b4ccae`
- BE가 별도 점프맵 API·물리·보상 계약을 제공하지 않으면 기존 비활성 처리를 유지한다. 기본 공원 맵 전환만으로 점프맵 기능까지 활성화하지 않는다.
- 별도 연동은 `frontend/docs/jumpmap/BE_추가요청_2026-10-30.md`를 참고한다. 사용자/BE 담당자 간 인계 시 이번에 동기화한 코스 파일을 사용한다.

## 재검증 명령

```bash
# 저장소 루트
python3 infra/ci/check_park_handoff.py
bash infra/ci/run-generated-map-tests.sh handoff

# frontend
pnpm map:check
pnpm jumpmap:check
VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park
```

검증과 전달 준비만 수행했으며 원격 push, 서버 스테이징, 앱 재시작, FE 게시 및 인프라 담당자에게 메시지 발송은 실행하지 않았다.
