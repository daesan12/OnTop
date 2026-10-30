# 새 공원 맵 릴리스 준비와 전환 절차 (Jira S15P31B105-273)

## 현재 상태와 고정 기준

- 최초 FE 전달 기준은 MR !199, 머지 커밋 `927f25210afe048f71e65e6abded06e85edb83b8`이다. 이 파일이 추가된 `dev`에는 이후 BE의 18개 테이블 매핑도 들어 있다.
- 광장 수정 최신 후보: `mapId=park`, `schemaVersion=2`, `mapVersion=a0f4df03ce302cfc8a82d2c9c933ae1a8d58dfaea307640e1191a7ab4556a620`. `server-map.json` SHA-256은 `326a2812f3dea49cb72fbd808c8f846aebea66061ce9eb1086f373151b074cac`이다. [최신 요청문](../../docs/integration/park-180/plaza-infra-request.md)의 같은 커밋 생성물을 사용한다. 최신 후보의 서버 스테이징·전환은 이번 로컬 준비에서 실행하지 않았다.
- 개발 매핑의 BE 확정본은 `8c7bf72`에 반영된 `docs/integration/park-180/park-bindings.dev.json`이다(2026-10-30 담당자 확인). `frontend/public/park-bindings.generated.dev.json`은 바이트까지 동일한 FE 정적 응답 파일이다. Git 원본과 Linux 서버 파일의 SHA-256은 `f959b89c6bfd1873f565e5e9fe87594f6bebd5427da00ef169b09bc15feacc62`이다. Windows에서 CRLF로 체크아웃한 작업 파일은 바이트 해시가 다를 수 있으므로 배포 기록에는 Git 원본 해시를 사용한다.
- DEV 자동 배포는 `frontend/vercel.dev.json`을 명시해 `VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park`와 `dist-park`를 사용한다. 기본 `vercel.json`과 운영 프로젝트의 빌드 설정은 유지한다. 새 FE 게시 전 실행 중 DEV BE의 generated 맵 identity가 일치해야 한다.
- 운영용 채널 매핑 파일은 아직 확정되지 않았다. 운영 FE에 개발용 매핑을 재사용하지 않는다.
- 2026-10-30 DEV-CI에는 이전 후보의 두 맵 JSON을 `/opt/ontop/maps/04350122fdeee2b89212345ee4f776990d78832bb25435418b5ea6f2b2fbc769/`에 스테이징했다. 서버에서 map SHA-256과 manifest SHA-256(`f6e6e8a06ff4e3357336f0b134230103160eac7bd24b15e9c51387315529e668`)을 확인했다. 디렉터리는 `root:root 0755`, 파일은 `root:root 0644`이며 기존 DEV 앱은 전환 전까지 이전 맵을 유지한다.
- 현재 `https://dev.on-top.world/park-bindings.generated.dev.json`은 HTTP 200 JSON이며 18개 bindings·5개 emotes를 제공한다. 2026-10-30 응답 본문의 SHA-256도 위 BE 확정본과 일치했다. URL 제공 확인은 새 맵 화면 전환과 별개다.

## CI에서 확인하는 것

1. `python3 infra/ci/check_park_handoff.py`는 manifest에 기록된 생성 파일과 입력 파일의 SHA-256, 맵 identity, 18개 앵커, BE/FE 매핑·emotes 일치를 확인한다.
2. `frontend`에서 잠금 파일 기준 설치 후 `pnpm map:check`를 **빌드 전에** 실행한다. 맵 관련 변경 또는 CI 변경이면 `VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park`로 후보 번들을 만든다. 출력은 `frontend/dist-park/`이다.
3. 백엔드 전체 테스트가 필요한 빌드에서는 `bash infra/ci/run-generated-map-tests.sh full`로 네 파일을 준비해 `TEST_GENERATED_MAP_DIR`을 설정한다. 맵/CI 변경만 있는 빌드는 같은 스크립트의 `handoff` 모드로 여섯 전달본 테스트를 실행한다. JUnit XML이 없거나 0건·스킵·실패이면 빌드가 실패한다.
4. 일반 FE 변경도 새 맵 빌드를 검사한다. DEV Vercel 배포 직전에 `python3 infra/ci/check_live_park.py`로 실행 컨테이너의 `WORLD_MAP_SOURCE`와 마운트된 JSON의 mapId·schemaVersion·mapVersion을 비교한다. 구 맵 BE나 버전 불일치는 FE 게시를 차단한다. 배포 프로젝트 ID도 `ontop-frontend-dev`로 제한한다. CI 성공 후 실제 개발 도메인의 공원 입장도 확인한다.

로컬에서 동일한 파일 검사: 저장소 루트에서 `python3 infra/ci/check_park_handoff.py`, `frontend`에서 `pnpm map:check`. BE 전달본 검사는 Java 21이 있는 Linux 빌드 환경에서 `bash infra/ci/run-generated-map-tests.sh handoff`로 실행한다.

## 서버 파일 공급

개발 채널의 18개 실제 ID는 위 BE 파일로 확정됐다. 운영 채널 목록과 운영용 실제 ID는 별도로 확정해야 한다. 맵을 다시 생성하면 위 후보 값 대신 **새 manifest와 원본 파일**을 기준으로 한다. 동일 커밋에서 BE/FE 매핑을 갱신한 뒤 CI를 다시 통과시킨다.

서버 관리자는 CI가 검사한 전체 저장소 체크아웃에서 다음 스테이징 명령을 실행한다. 스크립트는 파일 내용·매핑을 재검증하고 맵 JSON 두 개를 루트 소유의 버전별 디렉터리로 복사한다. 이미 같은 버전이 있으면서 바이트가 다르면 중단한다. 이 명령은 앱을 재시작하지 않는다.

```bash
sudo bash /var/lib/jenkins/workspace/ontop-dev/infra/app/stage-generated-map.sh \
  /var/lib/jenkins/workspace/ontop-dev
# 출력 예: /opt/ontop/maps/<확정-mapVersion>
sha256sum /opt/ontop/maps/<확정-mapVersion>/server-map.json
```

BE 컨테이너 경로는 `/run/ontop/maps/server-map.json`, `/run/ontop/maps/manifest.json`이다. `infra/app/compose.generated-map.yaml`을 기본 Compose에 추가할 때만 `/opt/ontop/maps/<확정-mapVersion>`이 읽기 전용으로 마운트되고 다음 값이 활성화된다.

```text
WORLD_MAP_SOURCE=generated
WORLD_MAP_JSON_PATH=/run/ontop/maps/server-map.json
WORLD_MAP_MANIFEST_PATH=/run/ontop/maps/manifest.json
WORLD_MAP_REQUIRE_MATCH=true
```

실행 앱은 시작할 때만 파일을 읽는다. 파일만 교체해도 새 맵이 적용되지 않는다. 파일 누락·체크섬 불일치는 앱 시작 실패로 취급한다.

## 공동 검증 환경과 전환 게이트

1. 확정된 개발 매핑과 맵 세트를 사용해 Jenkins에서 여섯 전달본 테스트가 실제 실행되어 통과했음을 확인한다. 스킵은 통과가 아니다. 운영 매핑은 별도 확정이 필요하다.
2. 새 맵 FE는 **`pnpm build:park` / `frontend/dist-park/`**로 배포한다. `VITE_PARK_BINDINGS_URL`은 빌드 시 `/park-bindings.generated.dev.json` 같은 확정 정적 경로로 설정한다. 배포 후 해당 URL이 200 JSON을 반환하며 18개 매핑·emotes가 BE 파일과 일치하는지 확인한다. 운영은 별도 확정 운영 매핑 JSON을 만든 뒤 그 URL로 빌드한다.
3. 현재 FE의 `/api` rewrite와 WS 호스트 선택은 `dev.on-top.world`와 `www.on-top.world`에 맞춰져 있다. 임의 Vercel preview 주소는 이 경로·OAuth·허용 Origin이 자동으로 연결되지 않는다. 공동 검증은 기존 개발 도메인에서 전환 시간을 정해 수행하거나, FE/BE가 preview 도메인의 REST·WS·OAuth 구성을 먼저 별도로 맞춘다.
4. 같은 릴리스 표에 FE 전체 Git SHA와 Vercel 배포 ID, BE 이미지 태그·digest, 맵 버전·JSON SHA, BE/FE 매핑 SHA, DEV/PROD 도메인과 전환 시간을 기록한다. REST/WS 로그인, `CONNECTED → WORLD_MAP_CONFIRM → WORLD_MAP_STATE(verified=true) → CHANNEL_JOIN`, 18개 테이블·시설·이동·재접속을 실제 계정으로 공동 검증한다.
5. 최종 배치/출시 메타데이터가 바뀌면 맵을 다시 생성하고 **양쪽을 새 버전으로 재검증**한다. 실제 DEV 전환 후 운영 전환 여부를 별도로 결정한다. PROD는 운영 매핑·게임 영향·복구 준비가 완료된 뒤 수동 전환한다.

현재 구조는 단일 BE 앱과 도메인별 Vercel FE 배포이므로 FE/BE의 완전한 무중단 원자 전환을 제공하지 않는다. 전환 중 다른 버전이 잠깐 함께 보이면 맵 확인 계약이 입장을 차단할 수 있다. 공동 점검 시간에 진행 중 게임을 마친 뒤 순서대로 교체하고, 새로고침·재접속을 안내한다.

## DEV 전환 시에만 실행할 운영 절차

확정 세트의 파일이 서버에 있고, 기존 FE 배포 ID·BE 이미지·환경파일 백업이 기록된 뒤 실행한다. 운영자는 `/opt/ontop/infra/app/compose.generated-map.yaml`과 최신 `infra/ci/deploy-dev.sh`가 DEV-CI 서버에 설치됐는지 먼저 확인한다. 기존 Jenkins sudo 허용 경로 `/usr/local/sbin/ontop-deploy-dev`를 사용하는 설치본도 동일 버전으로 갱신해야 이후 자동 배포가 새 마운트를 유지한다.

1. `/etc/ontop/dev-app/deploy.env`에 `PARK_MAP_HOST_DIR=/opt/ontop/maps/<확정-mapVersion>`을 추가한다.
2. `/etc/ontop/dev-app/park-map.enabled`에 **확정 mapVersion 한 줄만** 기록한다. 이 표식과 `deploy.env`의 경로가 다르면 자동 배포는 중단된다.
3. Compose 설정을 검사한 뒤 기존 앱만 재생성한다. 아래 명령은 서비스 연결과 진행 중 게임을 끊으므로 공동 전환 시간에만 실행한다.

```bash
cd /opt/ontop
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env \
  -f infra/app/compose.dev.yaml -f infra/app/compose.generated-map.yaml config --quiet
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env \
  -f infra/app/compose.dev.yaml -f infra/app/compose.generated-map.yaml \
  up -d --no-deps --force-recreate app
```

4. 앱 health, 시작 로그의 맵 identity, 실제 WS 확인 상태를 확인하고, FE 개발 프로젝트의 새 맵 빌드를 같은 검증 시간에 `dev.on-top.world`로 전환한다. Vercel의 빌드 명령·출력 디렉터리가 각각 `pnpm build:park`, `dist-park`인지 확인한다. 기존 일반 빌드 설정으로 재배포하면 구 맵으로 돌아간다.
5. 이후 Jenkins FE 배포도 `--local-config vercel.dev.json`으로 새 맵을 유지한다. 구 맵으로 되돌릴 때는 BE와 FE를 함께 복구하고 이 DEV 전용 배포 설정도 호환되는 커밋으로 되돌린다.

## 복구

문제가 생기면 직전 호환 세트의 FE 배포와 BE 이미지, JSON/manifest, 매핑, 설정을 **함께** 되돌린다. generated 전환 직후 구 맵으로 되돌리는 경우 DEV 서버의 `park-map.enabled` 표식을 제거하고, 이전 `deploy.env`를 복구한 뒤 기본 Compose만 사용해 앱을 강제 재생성한다. Vercel도 직전 정상 일반 빌드를 다시 승격한다. 이후 `/actuator/health`, 로그인, 공원 입장과 WS 확인을 재검증한다. JSON 파일 하나만 바꾸는 것은 복구가 아니다.
