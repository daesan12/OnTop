# 공원 데이터 생성·빌드·검증

공통 설정은 FE 미리보기, 서비스 `/park`, Java 서버 데이터와 같은 맵 버전을 공급한다. 설정 변경 후 생성물을 커밋하고 **같은 커밋의 FE와 BE를 빌드·배포**한다. 실행 중 서버 핫 리로드는 제공하지 않는다.

## 생성과 검사

Node 24와 기존 의존성을 사용한다. `frontend`에서 실행한다.

```sh
pnpm map:generate
pnpm map:check
pnpm typecheck
pnpm typecheck:tests
pnpm test
pnpm build
```

| 파일 | 용도 |
| --- | --- |
| `src/map/park/definition.ts` | 고정 ID별 배치·구역·경계·호수 설정 |
| `src/map/park/{resolve,physics,interactionData,lake}.ts` | 배치·무확장 3D 형상·시설 Pose 계산 |
| `generated/park/server-map.json` | Java가 로딩하는 schemaVersion 2 데이터 |
| `generated/park/manifest.json` | 동일 버전, 입력 지문, 출력 바이트 체크섬 |
| `src/map/park/generated/mapVersion.ts` | FE 입장·복구 계약과 미리보기 identity |
| `src/park/mapConfig.ts` | 서비스 상호작용·내비게이션 배치 어댑터 |

세 생성물을 소스와 함께 커밋한다. 직접 편집하지 않는다. `map:check`는 읽기 전용이며 오래된 생성물은 실패시킨다. CI에서는 자동 생성하는 `build`보다 먼저 검사한다.

미리보기 개발 서버는 관련 소스 저장 시 자동 생성·새로고침한다. 일반 서비스 개발 서버에서는 설정 변경 후 `map:generate`를 실행하고, Java 서버도 재빌드·재시작한다. FE production build는 먼저 자동 생성한다.

## 재현 가능한 버전

객체 키를 정렬한 데이터 canonical JSON의 SHA-256과 실제 사용한 TypeScript 입력의 SHA-256 목록을 계산한다. 입력은 LF 정규화하며 생성 버전 모듈은 입력에서 제외한다. `format/schemaVersion/mapId/hashAlgorithm/hashes/semantics`를 다시 canonical JSON으로 해시한 64자리 값이 `mapVersion`이다. 배열 순서와 좌석 인덱스는 유지한다.

시간·절대 경로는 포함하지 않는다. 같은 소스는 같은 결과를 생성한다. 입력 그래프의 주석 변경도 버전을 바꿀 수 있다. 장식 모델 외형 등 입력 그래프 밖의 변경은 해시에 포함되지 않는다. 생성 중 입력 변경을 감지하면 실패하며, `.park-map-cache/generation.lock`으로 동시 쓰기를 조정한다.

manifest의 `validation`은 생성 단계 검증이다. 배포 완료나 운영 통합 검증 통과를 주장하지 않는다.

## Java와 CI

`backend`의 `verifyParkMap`은 schema·identity·server-map 체크섬·바이트 수·입력 파일 지문을 검사한다. `processResources`는 두 JSON을 JAR의 `world/generated/park/`에 넣는다. `GeneratedParkMap`은 JAR 리소스의 identity와 체크섬을 검사한다. 런타임에 Node나 외부 파일 경로가 필요하지 않다.

```sh
cd backend
./gradlew test parkMapTest bootJar --no-daemon
```

기존 `test`는 이전 맵 고정 회귀를 위해 테스트 JVM에 `ontop.map.legacyFixture=true`를 지정한다. 새 맵의 실제 Java 엔진·WebSocket 검증은 **별도 필수 `parkMapTest`**이며 `check`에도 연결했다. 운영 기본값은 새 생성 맵이다. 기존 고정 회귀 통과만으로 새 맵 검증을 대신하지 않는다.

Jenkins는 공통 설정·생성 데이터 변경을 FE/BE 양쪽 변경으로 분류한다. `map:check` → Java `test parkMapTest` → FE 테스트·빌드 순서로 검사한다. Docker는 저장소 루트에서 빌드한다.

```sh
docker build -f backend/Dockerfile -t ontop-backend:local .
```

기존 CI/인프라 수동 검토 게이트는 유지한다. 이 문서의 명령 실행은 배포를 수행하지 않는다.

## 테이블·장애물 이동 전체 흐름 검증

```sh
cd frontend
pnpm map:verify-flow
```

Java 21과 설치된 Playwright 브라우저(Windows는 Edge)가 필요하다. 검증 중 배치 파일을 다른 작업에서 편집하지 않는다.

1. 원본 배치로 생성·실제 Java 물리/소켓·FE `/park` 브라우저 검사를 실행한다.
2. `table-1` X를 -10→-12m, 우체통 X를 -18→-16m로 임시 변경한다.
3. 재생성·재로딩 후 테이블 ID/좌석·관전 20m·우체통 충돌·스폰/수영·화면 좌표·맵 버전·서버 승인 이동을 다시 검사한다.
4. 원본 소스를 복원하고 원본 생성물을 다시 만든다. 결과 JSON과 스크린샷은 `QA_ARTIFACT_DIR` 또는 OS 임시 폴더에 남긴다. 실패 시에도 원본 복원을 시도하며 동시 편집을 감지하면 덮어쓰지 않는다.

브라우저 인증/프로필/채널 목록 REST만 테스트 fixture다. 맵 identity·이동·입장·복구 WebSocket은 실제 Java 서버를 사용한다. 테스트 전용 Vite 프록시와 인증 fixture는 production 설정에 연결하지 않는다. Browser plugin not available: Playwright/Edge를 사용한다.

상세 좌표·충돌 계약은 [PARK_BE_HANDOFF.md](PARK_BE_HANDOFF.md), 설정 항목은 [PARK_COMMON_SETTINGS.md](PARK_COMMON_SETTINGS.md)를 따른다.

## 로컬 확인 기록 (2026-10-26)

- 원본 맵 버전: `a02ce148f922762eebf2d8107570587062a2d54ac590eb011615a2b4137ae92b`.
- 임시 이동 버전: `58d1e0357d3f725c22526426631d00ae8c419658e749957926c84f28d9ca64b9`.
- 원본: table-1 `[-10,0,32]`, 우체통 `[-18,0,18]`. 임시 이동: 각각 `[-12,0,32]`, `[-16,0,18]`.
- 두 경우 모두 실제 Java 물리·WebSocket·FE 화면의 좌표/identity, 서버 승인 이동, 테이블 좌석, 관전 20m 경계, 우체통 충돌, 스폰 높이와 호수 수영 검사를 통과했다. 원본 소스·생성물을 복원했다.
- FE 단위 479개, 앱·테스트 TypeScript, production build, 확정 미리보기 배치/수영/점프 브라우저 2개, CI 분류 테스트 9개를 통과했다. 배포 JAR의 JSON이 원본 생성물과 바이트까지 일치하는 것도 확인했다.
- Docker 엔진이 실행 중이지 않아 컨테이너 이미지 빌드는 실행하지 못했다. 원격 Jenkins 실행과 실제 배포는 수행하지 않았다.
- Java 기존 전체 회귀 1,517개 실행에서 응답 계약 관련 2개가 실패했다. OpenAPI 정적 명세와 공개 필드 검증을 수정한 뒤 해당 두 클래스의 12개 검사를 재실행해 모두 통과했다. 나머지 1,515개는 최초 실행에서 통과했다. 최종 필수 `parkMapTest`도 Java 4개를 다시 통과했으며, 브라우저 케이스는 앞선 원본/이동 검증에서 각각 실행했다.
