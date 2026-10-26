# FE 새 공원 연결과 테스트 서버 인계

최신 dev의 BE 버전 확인 계약과 16개 매핑을 FE에 연결했다. Java·CI 파일은 직접 수정하지 않았다. 최신 dev를 병합하면서 받은 BE 변경은 해당 브랜치 원본 그대로 유지했다.

## 실행 모드

현재 BE 개발 서버는 이전 맵을 사용한다. FE도 기본 서비스 모드를 유지하고, 새 180m 맵은 명시적인 `park-integration` 모드에서 같은 `/park` 경로로 실행한다. 서버 응답이나 URL 쿼리로 맵을 자동 선택하지 않는다.

| 명령 | 장면·버전 | 빌드 결과 |
| --- | --- | --- |
| `pnpm dev`, `pnpm build` | 기존 맵·기존 identity | `dist/` |
| `pnpm dev:park` | 새 공통 설정·생성 schemaVersion 2 identity | localhost:5202의 `/park` |
| `pnpm build:park` | 새 공통 설정·생성 schemaVersion 2 identity | 별도 `dist-park/` |
| `pnpm dev:layout` | 서버에 연결하지 않는 확정 배치 미리보기 | 127.0.0.1:5201의 `/layout-preview.html` |

BE 테스트 서버 주소를 받으면 frontend에서 실행한다. 아래 주소는 대입 예시이며 실제 준비된 서버 주소가 아니다.

```powershell
$env:API_PROXY_TARGET='http://<BE가 전달한 호스트:포트>'
pnpm dev:park
```

브라우저는 `http://localhost:5202/park`로 접속한다. 기존 로그인·사용자 REST와 `/ws/tables` 접속권 경로를 그대로 사용한다. 운영 앱에 테스트 로그인이나 소켓 우회는 추가하지 않았다. BE는 이 Origin을 허용하는 테스트 실행 설정을 준비해야 한다. REST와 WS 주소·경로가 서로 다르면 FE 프록시 설정을 함께 맞춘다.

## 연결한 FE 범위

- `src/park/mapSelection.ts`: 빌드 시 새 맵 선택. 일반 빌드의 기본값은 기존 맵.
- `src/park/mapConfig.ts`: 선택한 맵의 테이블·벤치·운동기구·망원경·소리함·익명 메모함·구역·바닥·충돌 어댑터.
- `WorldCanvas`: 새 모드에서 확정 미리보기의 코드 모델 장면을 재사용한다. 기존 테이블 상호작용, 캐릭터·따라가기·경기 연출을 유지한다. 미리보기 전용 점프 게임·미리보기 카메라는 서비스 입력으로 활성화하지 않는다.
- 새 모드의 벤치 화이트리스트는 생성 ID를 사용한다. 시설 use/exit와 메모함 높이는 제공한 생성 좌표와 맞춘다.
- 미니맵·목적지·길찾기는 같은 배치와 3D 프록시를 사용한다. 전망대는 지상 접근까지만 안내하며 나선층을 단일 평면 경로로 가로지르지 않는다.
- 새 모드 개발 서버에서도 설정 저장 시 JSON·manifest·FE 버전을 함께 재생성·새로고침한다. 실행 중 BE 데이터가 갱신되는 기능은 아니므로 BE 재로딩·재시작은 담당자와 조율한다.

## 버전 확인 순서

```text
CONNECTED.map 비교
  → WORLD_MAP_CONFIRM(FE 자체 identity)
  → WORLD_MAP_STATE(map 일치, verified:true, 요청 ID 일치)
  → CHANNEL_JOIN({channelId}) / 기존 경기 복구
```

`CONNECTED`의 일치만으로 입장하지 않는다. `WORLD_MAP_STATE`를 확인하기 전 입장·이동·시설·복구 요청을 보내지 않는다. 구형 서버가 확인 전 보낸 경기 상태는 제한된 버퍼에서 보류하고 확인 후 처리한다. 불일치·미확인 오류는 `payload.serverMap`을 읽고 새로고침·수동 재접속을 안내하며 늦은 응답으로 차단을 해제하지 않는다.

기존 `CHANNEL_JOIN`·`GAME_RECONNECT_CHECK` payload에는 map을 추가하지 않는다. 재접속하면 다시 확인한다. 새 맵 모드에서는 서버 identity 누락도 거절한다. 기본 구형 맵 모드의 metadata 없는 과거 서버 호환 경로는 유지한다.

## 테이블 매핑

BE가 dev에 전달한 파일을 다음 이름으로 별도 보관한다.

- `public/park-bindings.generated.dev.json`: channel-1의 16개.
- `public/park-bindings.generated.frontend-test.json`: channel-1/2의 16개씩, 총 32개.

새 모드 기본값은 generated.frontend-test 파일이다. 기존 `park-bindings.json`, `.dev.json`, `.frontend-test.json`은 현재 서버용 그대로 유지한다. 신규 매핑의 기존 2개 서버 ID와 emotes 추가 필드도 보존했다. UUID를 FE에서 새로 발급하거나 목록 정렬 순서로 앵커를 추정하지 않는다.

테스트 서버의 실제 채널이 확정되면 사용할 파일을 선택한다.

```powershell
$env:VITE_PARK_BINDINGS_URL='/park-bindings.generated.dev.json'
pnpm dev:park
```

BE가 별도 채널을 제공하면 해당 실제 매핑을 받은 뒤 파일을 추가·검증한다. 생성 데이터는 table-1~table-16을 유지하며 모두 실제 게임용이다.

## FE 검증과 남은 공동 검증

```sh
pnpm map:check
pnpm typecheck
pnpm typecheck:tests
pnpm test
pnpm test:e2e:park
pnpm build
pnpm build:park
```

Browser plugin not available: 기존 Playwright/Edge를 사용한다. 새 맵 브라우저 검사는 테스트 파일에서만 REST/RawWS를 가로채는 계약 fixture다. Java 충돌·실제 인증·서버 영속화를 대신 검증하는 테스트가 아니다. 캡처·실행 산출물은 저장소 밖 `QA_ARTIFACT_DIR` 또는 OS 임시 폴더에 저장한다.

BE 회신에 따르면 새 맵은 BE 로컬 자동 테스트에서 확인했고, FE가 접속할 테스트 서버 주소는 아직 준비되지 않았다. 아래 내용을 받은 후 공동 검증한다.

1. 새 맵 실행 서버 주소와 로그인/REST/WS 접속 방법, 허용 Origin.
2. 실제 로딩한 mapId/schemaVersion/mapVersion, 채널 목록과 동일 버전 테이블 매핑.
3. 같은 생성 파일로 실행했는지 확인 후 이동·충돌·계단·다리·전망대·16개 좌석·시설·스폰·수영·재접속·구버전 차단 검사.
4. 테이블 하나·장애물 하나의 임시 이동을 양쪽 재빌드 후 검사하고 확정 배치 복원.
5. 양쪽 검증 후 인프라 담당자가 CI·동시 전환·배포를 조율한다. 일반 서비스 모드의 기본값 변경은 이 단계에서 별도 적용한다.

BE 서버가 준비되지 않은 상태에서 FE만 새 맵으로 배포하지 않는다. 이 변경은 FE 연결 준비와 자체 검증이며 실제 서버 공동 검증·서비스 배포 완료를 뜻하지 않는다.

## 이번 FE 자체 검증 결과 (2026-10-26)

| 검사 | 결과 |
| --- | --- |
| 생성물 검사 | schemaVersion 2, mapVersion `5ce3cff53136eaa3be6a9fe3048d49f611403c1ceff41d2c8f266e26cc6ac840`, 변경 없이 일치 |
| 단위 테스트 | 69개 파일·641개 통과. 16개 매핑, 스폰→11개 구역, 양쪽 호수 횡단, 승인 전 차단 포함 |
| 타입·경계 검사 | 앱/테스트 TypeScript 및 migration boundary 통과 |
| 빌드 | 기존 `dist/`와 새 맵 `dist-park/` 모두 성공 |
| 새 맵 브라우저 | 3개 통과. 16개 렌더 좌표·identity·미니맵, Worker 길찾기, WASD 이동, table-16 착석/퇴장, 벤치·운동기구·망원경 이용/퇴장, 정상 메모함 접근, 수영 상태 표시, 구형/누락/실행 중 버전 차단 |
| 기존 서비스 회귀 | 버전 계약·테이블 로비·따라가기/감정표현 12개 통과 |
| 배치 미리보기 회귀 | 낮/밤/배치·이동 경계 및 점프맵 체험 통과 |
| 실제 BE 공동 검증 | 접속 서버 미준비로 미실시. 위 브라우저 검사는 테스트 fixture 사용 |

병렬 부하 중 watcher 복구 검사와 기존 점프맵의 시간 의존 착지 검사가 각각 한 번 실패했다. 단위 전체 재실행 641개와 점프맵 단독 재실행은 통과했다. Three.js의 기존 Clock/셰이더 정밀도 경고와 Vite 번들 크기 경고는 남아 있으며 빌드는 성공했다. 새 맵 양성 시나리오는 pageerror·Vite 오류·세션 오류가 없는지도 검사한다.
