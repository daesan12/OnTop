# Quest 2 · 공원과 돌탑 점프맵 VR

- 현재 작업 위치: `C:\Users\SSAFY\Desktop\OnTop\quest-vr`.
- 현재 브랜치: `VR` (2026-11-04 `feat/quest-vr`에서 이름 변경).
- 현재 통합 기준: `origin/dev@a9afd16b0e0268916c7991aed92d8f0ac95ac9f9` (2026-11-05).
- 이관 원본: `park-jumpmap-vr-20261104`, `feat/park-jumpmap-vr-local-20261104@324db890`의 미커밋 VR 변경. 원본은 삭제·변경하지 않고 보존한다.
- 기존 `quest-locomotion-poc`의 미커밋 작업과 독립 이동 화면은 원래 위치에 보존한다. 2026-11-04 사용자 승인으로 feat/quest-vr에 커밋·푸시하며 dev/master 머지·배포는 진행하지 않는다.

## 플레이 범위

일반 화면에서 로그인·채널 입장 → **공원 VR 시작** → 내 시점으로 공원 이동·점프 → 첫 돌 착지로 돌탑 시작 → 구간 통과 → 마지막 연잎 완주 → VR 결과·랭킹 → 계속하기 → 공원 이동 → VR 종료.

Quest 기본 브라우저의 `immersive-vr`/`local-floor` 세션을 사용한다. 양쪽 눈 렌더링과 헤드셋 추적은 Three.js/R3F의 기존 XR 루프가 담당하며 별도 렌더 루프를 중복 설치하지 않는다.

| 행동 | Quest Touch |
| --- | --- |
| 걷기 | 왼쪽 스틱, 시선의 수평 방향 기준 |
| 달리기 | 왼손 그립을 누른 채 왼쪽 스틱 |
| 점프 | 오른손 A, 누른 순간 한 번 |
| 회전 | 오른쪽 스틱 좌우, 30도 스냅, 중앙 복귀 후 재회전 |
| 돌탑 놀이 방법 | 왼손 X |
| 안내·결과 계속 / 랭킹에서 결과 복귀 | A, 해제 후 다시 누르기 |
| 패널 버튼 선택 | 양손 레이저 + 해당 손 트리거 |
| VR 종료 | 오른손 B 또는 시스템 VR 종료 |

이동은 스틱 중심이다. 실제로 뛰지 않는다. 머리의 자연스러운 추적 이동을 캐릭터 몸체 이동/점프로 전송하지 않는다. 몸체 충돌은 기존 공원 물리를 사용하며, 현실 공간 보행을 몸체 충돌에 통합한 room-scale 이동 기능은 포함하지 않는다.

공원 전체 시설·다른 미니게임의 VR UI는 이번 범위에 포함하지 않는다. 해당 활동이나 일반 메뉴가 입력을 소유하면 XR을 종료하고 기존 화면으로 돌아간다. 돌탑 안내·완주·랭킹은 3D 패널로 처리하므로 XR을 유지한다.

## 실행

Node 24 및 저장소 lockfile에 맞는 의존성, 실제 로그인/REST/WS를 제공하는 백엔드가 필요하다. 현재 작업 위치의 `frontend/node_modules`는 원래 프로젝트의 설치된 동일 의존성을 junction으로 재사용한다.

1. Quest 개발자 모드·USB 디버깅을 준비하고 헤드셋 안에서 연결을 승인한다.
2. 백엔드를 실행한다. 기본 주소는 `http://127.0.0.1:8080`이다.
3. PowerShell에서 아래를 실행한다.

```powershell
& 'C:\Users\SSAFY\Desktop\OnTop\quest-vr\frontend\scripts\start-park-xr.ps1' -ConnectQuest -AdbPath 'C:\Users\SSAFY\Desktop\platform-tools\adb.exe'
```

프론트엔드 포트는 **5288**, strictPort다. 다른 서버를 종료하거나 포트를 자동 변경하지 않는다. 이미 실행 중인 서버의 USB 연결만 갱신하려면 같은 명령의 `-ConnectQuest`를 `-ConnectQuestOnly`로 바꾼다. 다른 테스트 백엔드는 `-ApiProxyTarget`에 기본 주소를 지정한다.

4. Quest 기본 브라우저에서 `http://localhost:5288/park`를 연다. USB/ADB reverse를 유지한다. 일반 LAN HTTP 주소는 WebXR secure context를 만족하지 않는다.
5. 로그인하고 채널에 입장한다. 열린 메뉴를 닫고 **공원 VR 시작**을 누른다.
6. 양손 스틱을 중앙에 놓고 버튼을 뗀 다음 조작한다. 첫 돌에 착지하면 기존 서버가 도전을 시작한다.

백엔드 health 조회에 실패하면 실행 스크립트가 서버를 시작하지 않고 원인을 표시한다. 프록시 주소만 지정해서 인증이 준비되는 것은 아니다. 허용 Origin·OAuth 콜백·쿠키·WS를 `localhost:5288`에 맞춰야 한다. 배포 사이트의 로그인 쿠키가 localhost에 공유된다고 가정하지 않는다. 이 로컬 소스는 배포 사이트에 반영되지 않았다.

## 모듈·연결 계약

- 공원 XR: `src/features/parkXR/`. 시작·종료·추적·스냅·입력 소유권 연결.
- XR 입력·시점: `src/world/xrInput.ts`, `src/world/xrView.ts`. `handedness`와 `xr-standard`를 확인하며 Quest Touch A/B/X와 스틱을 읽는다.
- 돌탑 XR 화면: `src/features/jumpmap/JumpmapXRPanel.ts`, `xrModel.ts`. 시간·구간·보상·안내·완주·랭킹을 기존 store에서 읽는다.
- 랭킹 파싱: `src/features/jumpmap/ranking.ts`. 기존 PC 랭킹 화면과 응답 검증을 공유한다. VR에서는 5명씩 페이지를 넘겨 최대 50명을 확인한다.

`readXRInput → ParkXRMovement → parkRuntime.move/stopMovement → 기존 입력 버퍼·예측·서버 위치 검증`을 사용한다. 렌더링마다 WS를 보내지 않고 기존 60ms 입력 주기와 CLIENT_VALIDATED 정지 위치 heartbeat를 따른다. 새 gameCode·WS 메시지·위치 권한·물리·지갑·정산 경로를 만들지 않는다.

REST는 기존 jumpmap status/tips/rankings, 진행·완료·지급은 기존 `JUMPMAP_*` 이벤트를 사용한다. 실제 지급과 랭킹은 서버 확정값만 표시한다. 확인 중인 보상과 실제 지급을 구분하며, 지연 정산은 기존 결과를 갱신한다. 닫은 완료창은 같은 종료 이벤트로 다시 열지 않는다. 완주는 마지막 연잎 착지 기준이며 호수 입수를 별도 완주 조건으로 추가하지 않는다.

## 카메라·입력·표시

- 카메라는 기존 예측/복제 아바타의 바닥 위치에 추적 눈높이를 더한다. 점프 높이는 기존 아바타 위치를 한 번만 반영한다.
- XR 중 일반 CameraRig/키보드/마우스 룩이 카메라와 입력을 덮어쓰지 않게 양도한다. 자기 모델은 VR에서 숨기고 다른 사용자에게는 기존 아바타가 보인다.
- 스냅 회전은 머리를 중심으로 적용한다. reference-space reset 때 추적 기준을 다시 잡는다.
- 소리·하늘·조명·LOD·효과 거리는 XR의 월드 좌표로 계산한다. 일반 화면에서는 기존 좌표를 그대로 사용한다.
- VR에서 돌탑 발판을 즉시 불투명하게 표시하고 착지 변형을 줄여 지지면을 읽기 쉽게 한다. 코스 좌표·충돌은 바꾸지 않는다.
- 돌탑 DOM 안내/결과창은 XR 동안 표시하지 않는다. VR 패널이 이동만 잠그고 헤드셋 추적·렌더링은 유지한다. 닫은 직후 스틱 중앙·A 해제를 거쳐야 다시 움직인다.
- 패널은 고개 회전에 고정하지 않지만 서버의 몸체 위치 보정·낙하 이동을 따라가 버튼 접근을 유지한다. 물·입자 효과가 UI 위에 그려지지 않도록 렌더 순서를 분리한다.
- 추적/포커스/페이지 가시성 상실 시 입력을 정지한다. 서버 중력·도전 시간을 임의 정지하지 않는다. 복귀 후 현재 서버 위치·도전 상태를 따른다.
- 계정·채널·맵 버전 변경이나 연결 해제 시 렌더 프레임이 중단되어도 세션을 종료한다. 종료 후 기존 PC 카메라·키보드가 복원된다.
- VR framebuffer scale은 0.8, foveation은 1을 초기값으로 사용한다. AdaptiveResolution의 일반 DPR 변경은 XR 중 중지한다. 실제 Quest FPS나 주사율 안정성을 보장하는 측정 결과는 아직 없다.

## 공통 변경과 보존 범위

`ParkPage`, `WorldCanvas`, `CameraRig`, `input.ts`, `Avatars`, `AdaptiveResolution`에 XR 연결을 추가했다. `ParkSoundscape`, 환경·조명·하늘과 5개 장식/효과 컴포넌트는 카메라 월드 좌표 판독만 연결했다. 돌탑 내부의 DOM/XR 표시 분기와 랭킹 파싱을 연결했다.

시각 보존 checkpoint 7개 파일의 해시는 좌표 어댑터 변경에 맞춰 갱신했다. 어댑터 import와 호출을 역변환한 소스가 기존 체크섬과 정확히 같음을 확인해 모델·재질·배치 변경이 없음을 검증했다. 맵 버전·코스 생성물·맵 좌표·공통 protocol/runtime·BE·DB·의존성/lockfile은 이번 변경으로 수정하지 않았다. 최신 dev가 이미 보유한 V144 migration은 이번 VR 작업에서 만든 파일이 아니다. 신규 Flyway 파일은 없다.

## 검증 방법

`frontend`를 작업 디렉터리로 사용한다.

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --project tsconfig.tests.json --noEmit
node node_modules/typescript/bin/tsc --project tsconfig.park-xr.json --noEmit
node scripts/generate-park-map.mjs --check
node scripts/export-jumpmap-course.mjs --check
node node_modules/vitest/vitest.mjs run --maxWorkers=4
node node_modules/@playwright/test/cli.js test --config playwright.park-xr.config.ts
node node_modules/vite/bin/vite.js build --mode park-integration --outDir dist/park-xr
```

다음 표는 **원본 작업 위치에서 2026-11-04에 수행한 검증 이력**이다. 새 브랜치 이관 후 검증은 아래 별도 기록을 따른다.

| 검사 | 결과 |
| --- | --- |
| 소스 / 전체 테스트 / XR 전용 타입 검사 | 통과 |
| 전체 단위 테스트 | 2,030개 통과, 기존 6개 skip (225개 파일 중 222개 통과, 기존 3개 skip) |
| XR 브라우저 | 7개 통과: 거절/재시도, 기존 입력 복원, 이동·점프·달리기, 추적/연결 상실, 안내, 정산·완주·레이저 랭킹, 낮은 화면 |
| PC 돌탑 회귀 | 5개 통과: 낙하/지연 정산, 버전 불일치, 7종 착지 연출, 결과 잠금·중복 방지·좁은 화면 |
| 최신 dev 파클 카메라/입력 회귀 | 양쪽 좌석 2개 통과: 드래그·Tab·컵·주사위·모달 입력 |
| 페이지 / 렌더링 / 콘솔 | `/park`, OnTop, 공원/3D 패널 표시, 오류 오버레이·pageerror·console error 없음 |
| 화면 크기 | 1440×900, 390×844, 390×600, 844×390; PC 돌탑 회귀는 1920×1080 및 해당 테스트의 좁은 화면 |
| VR 시작 안내의 작은 화면 접근 | 최종 배치 보완 후 2개 브라우저 검사 추가 통과. 기존 도크·채팅과 겹치지 않으며 숨긴 스크롤바 상태에서 휠·키보드로 안내 접근 가능 |
| 맵 / 코스 / 시각 보존 | 통과. 맵 c05d8ada… / 코스 5e03c470… 유지 |
| 공원 빌드 / 스크립트 구문 / diff 검사 | 통과. 기존 대형 chunk·Three Clock/SwiftShader 경고는 유지 |
| 기존 VR 작업 보존 | 원본 tracked diff의 작업 전후 SHA256 동일 |

최종 검증 전 최신 dev를 반영하면서 기존 다른 테스트 파일의 타입 오류도 원격 수정본으로 해소됐다. 첫 전체 실행의 Windows 임시 rename 권한 오류는 적절한 실행 권한에서 재검증했고, 과도한 병렬 실행의 기존 지오메트리 테스트 시간초과는 `--maxWorkers=4`로 제한해 최종 전체 검증을 통과했다. 테스트를 skip하거나 timeout 값을 늘리지 않았다.

독립 검증은 `tests/park-xr/`의 브라우저 전용 XR/REST/WS fixture와 게임별 단위 테스트를 사용한다. 인증·서버 위치·XR 프레임을 모의하는 코드는 테스트 폴더에만 있으며 서비스 인증 우회·개발용 보상 경로를 추가하지 않았다. 자동으로 첫 발판 시작/구간/완주 이벤트를 주입하는 검사는 실제 서버의 전체 코스 완주를 뜻하지 않는다. 실제 Rapier 점프·얇은 발판·궤적 검증은 기존 점프맵 물리 테스트가 담당한다.

브라우저 검증 포트는 **5289**, 기존 PC 돌탑·파클 회귀는 별도 임시 설정의 **5290**이다. Browser plugin not available → 저장소 Playwright와 설치된 Chrome, SwiftShader를 사용했다. XR 시뮬레이션 스크린샷은 실제 헤드셋 캡처가 아니다. 자료·임시 회귀 설정은 저장소 밖 시각화 폴더에 둔다.

## Quest 실기기에서 남은 확인

1. 실제 백엔드 로그인 → 채널 입장 → VR 시작 → 양손 추적·바닥 높이.
2. 공원 장애물·경계 충돌, 이동/달리기/스냅/A 점프, 다른 PC와 아바타 동기화.
3. 첫 돌부터 일곱 구간까지 실제 조작, 좁은 발판 가장자리·공중 이동·낙하 후 재도전.
4. 실제 구간 지급·마지막 연잎 완주·랭킹·계속하기와 서버 지갑 갱신.
5. A/트리거를 누른 채 결과가 열리거나 닫힐 때 자동 점프·연속 선택 없음.
6. 시스템 메뉴·헤드셋 벗기·컨트롤러 연결 변경·재센터·네트워크 끊김·재진입.
7. 높은 구간·공원 중앙·여러 사용자에서 실제 프레임률·텍스트 읽기·낙하 조작감.

검증 시 ADB에 연결된 기기가 없었고 localhost:8080 백엔드도 실행 중이지 않았다. 실제 서버/헤드셋 통합 검수는 완료로 간주하지 않는다. 이 작업은 로컬 구현이며 커밋·푸시·MR·머지·Jenkins·브랜치 삭제를 수행하지 않는다.

## feat/quest-vr 이관 기록 — 2026-11-04

- 새 위치: `C:\Users\SSAFY\Desktop\OnTop\quest-vr`, 기준 `origin/dev@12bc82c1`.
- 원본의 tracked 변경은 패치로 반영하고 새 파일 19개를 복사했다. 원본 작업 파일 38개의 SHA256을 전후 비교해 원본 보존을 확인했다. 초기 독립 이동 PoC도 원래 위치에 남긴다.
- 최신 dev와 겹친 `Avatars`·`WorldCanvas`는 현재 아바타 성능 개선·프레임 공유 구조를 유지하면서 VR 숨김·월드 좌표·bridge만 추가했다. 시각 체크포인트는 최신 설명·다른 해시를 유지하고 실제 이관 파일 7개의 해시만 갱신했다.
- 최신 앱의 `/api/v1/operations/status` 확인에 맞춰 XR 브라우저 테스트 내부에 NORMAL 응답을 추가했다. 서비스의 운영 상태 검사·인증·서버 연결은 수정하지 않았다.
- 전체 테스트 타입 검사를 막던 기존 `skewer.test.ts`의 잘못된 재료 입력은 `unknown`을 거치는 타입 단언으로 의도만 명시했다. 런타임 게임 동작과 해당 부정 입력 테스트의 의미는 유지한다.
- `frontend/docs/vr/readme.md`를 추가하고 루트 `README.md`에서 연결했다. 개발자 가이드·실행 경로도 새 위치로 갱신했다.

| 새 브랜치 검증 | 결과 |
| --- | --- |
| 전체 테스트 타입 / XR 전용 타입 | 통과 |
| VR·이동·카메라·시각 보존 관련 단위 | 58개 통과 |
| 최신 아바타·프레임 공유·점프맵 물리/복구·입력·꼬치왕 부정 입력 회귀 | 69개 통과, 합계 127개 |
| XR 브라우저 | 7개 통과. 이동/달리기/A, 추적/연결 중단, 패널 잠금, 서버 이벤트 기반 완주·지연 정산·레이저 랭킹, 작은 화면 스크롤 |
| 페이지·콘솔·화면 | `/park` / OnTop, 공원·3D 패널 표시, 오류 오버레이·pageerror·console error 없음 |
| 화면 크기 | 1440×900·390×844·390×600·844×390 |
| 맵·코스 | c05d8ada… / 5e03c470… 유지, 생성물 변경 없음 |
| 공원 빌드 | 통과. 기존 큰 chunk·Three Clock/SwiftShader 경고는 있음 |
| 원격 기준·충돌 | 마무리 fetch의 dev와 HEAD가 동일. 공통 파일 3곳의 변경을 수동 보존·대조 |
| 원본 보존 | 원본 작업 파일 38개 SHA256 동일 |

Browser plugin not available → 기존 Playwright·설치된 Chrome/SwiftShader를 사용했다. 브라우저 테스트의 운영 상태·인증/서버·XR 프레임은 테스트 폴더의 시뮬레이션이다. 실제 Quest 재검수·개발 서버 로그인·보상·랭킹 저장 성공을 뜻하지 않는다.

새 검증 화면은 `C:\Users\SSAFY\.codex\visualizations\2026\10\30\01a18bbd-e069-7c42-a580-780c487d0035\quest-vr-transfer-20261104\`에 저장했다. 원본 해시 목록과 이관 패치는 같은 상위 시각화 폴더의 `quest-vr-source-before.json`, `quest-vr-transfer.patch`다.

이관 완료 시점에는 로컬 변경으로 보존했다. 이후 2026-11-04 사용자가 최신 dev 반영 후 feat/quest-vr의 커밋·GitLab 푸시를 승인했다. dev/master에는 머지하지 않으며 MR·배포·브랜치 삭제도 이번 요청에 포함하지 않는다. 실제 Quest 검수는 위 남은 항목을 따른다.

## 2026-11-04 최신 dev 통합 및 Quest 연결 전 PC 준비

- 사용자 요청으로 `VR@8ff32c58`에 `origin/dev@2e72a0dc8b4f5f17a08f3778e4649581fe2180c5`의 추가 11개 커밋을 이력 보존 방식으로 병합했다. `ParkPage.tsx`는 자동 병합됐으며 충돌은 없었다. 마무리 fetch에서도 dev 기준이 같음을 확인했다.
- 원격 `VR`은 직접/강제 푸시 금지, 개발자·유지관리자의 MR 머지 허용으로 보호돼 있다. 이번 동기화는 로컬 작업 기준에 반영하며 원격 직접 푸시·MR·원격 머지·배포·브랜치 삭제는 하지 않는다. 기존 VR 3개 커밋과 다른 worktree를 보존했다.
- Node 24.18.0, pnpm 11.25.0, Java 21, 기존 동일 의존성 junction을 확인했다. 실제 검사에는 설치된 Node 도구를 직접 사용했다. pnpm의 자동 의존성 확인은 Windows sandbox symlink 권한으로 실패했으며 의존성/lockfile을 변경하지 않았다.
- 앱/XR 타입 검사, 맵 `c05d8ada…` 및 코스 `5e03c470…` 검사 통과. 일반 공원과 협동 활성 공원 빌드, 백엔드 bootJar 빌드 통과.
- FE 전체 단위: 최초 2,167개 통과·2개 실패·기존 6개 skip. 실패는 임시 파일 rename 권한과 병렬 부하의 5초 시간초과였으며 두 파일을 정상 권한·단일 작업자로 재실행해 14개 모두 통과했다. 최종 서로 다른 통과 테스트는 2,169개다. timeout/skip/서비스 코드는 변경하지 않았다.
- BE 점프맵·생성 맵·꼬치왕 협동 회귀: 최초 101개 통과·맵 환경변수 미설정 4개 skip. 현재 generated 맵 경로를 제공해 나머지 4개를 별도 통과했다. 서로 다른 105개 통과이며 실제 MySQL/OAuth 검수와 구분한다.
- 기존 Playwright·Chrome/SwiftShader의 XR 브라우저 검사 7개 통과. 페이지 식별, 렌더링, 오류 오버레이/앱 오류 없음, 입력·중립 복구·추적 중단·결과·랭킹·낮은 화면 스크롤을 확인했다. Browser plugin not available; 테스트 전용 XR/REST/WS fixture이며 실제 기기·로그인 증거가 아니다. 기존 Three/SwiftShader·대형 chunk 경고는 남아 있다.
- PC 준비 파일은 저장소 밖 `C:\Users\SSAFY\Desktop\OnTop\output\quest-vr-pc-20261104\`에 두었다: `quest.env.example`, `Start-Backend.ps1`, `Start-Frontend.ps1`, `Connect-Quest.ps1`, `README.txt`, 브라우저 증거 PNG. 프론트 5288/백엔드 8080을 사용하며 세 PowerShell 스크립트의 구문 검사를 통과했다.
- 실제 OAuth·DB 설정 파일은 현재 없으며 사용자가 추후 제공하기로 했다. 백엔드 기동·실제 로그인·DB 초기화/적용·실제 지급은 보류한다. 기존 로컬 MySQL 컨테이너(13386)와 적용 이력은 변경하지 않았다. 신규 migration은 만들지 않았다.
- 향후 실제 설정은 기존 real-auth 실행기의 로컬 전용 DB 검사와 인증 WS를 사용한다. 공원/점프맵과 협동을 켜고 최신 generated 맵을 엄격히 확인한다. Quest USB 연결은 사이트 5288뿐 아니라 등록한 OAuth callback 8080도 reverse하도록 준비했다. 설정 미제공 상태에서 목업 로그인을 추가하거나 공개 개발 사이트로 우회하지 않는다.
- 기기 단계는 사용자가 Quest 홈 화면 표시를 확인했다. 다음 안내는 스마트폰 Meta Horizon 앱에서 해당 Quest 2가 표시되는지 확인하는 단계다. USB/ADB 연결은 아직 실행하지 않았다.

## 2026-11-05 dev 재통합

- 시작 시 `VR@e1546f13`의 미커밋 변경은 없었다. 기본 fetch는 삭제된 다른 브랜치의 refspec 때문에 실패해 dev/VR ref를 명시하여 최신 원격을 확인했다. 기존 fetch 설정과 다른 worktree는 변경하지 않았다.
- 먼저 `origin/dev@16564b51`의 추가 35개 커밋을 병합했다. `ParkPage.tsx`와 `CameraRig.tsx`는 자동 병합됐고 충돌은 없었다. 공통 코드의 최신 dev 변경과 기존 VR 입력/시점 소유권을 함께 보존했다. 이 통합과 아래 테스트 계약 보완은 로컬 병합 커밋 `d0c38e85`에 기록했다.
- 마무리 fetch 중 dev에 판돈 HUD 변경 2개 커밋이 추가돼 `a9afd16b0e0268916c7991aed92d8f0ac95ac9f9`까지 다시 반영했다. 추가 변경은 GameHud·판돈 계산·해당 CSS/테스트 5개 파일이며 충돌은 없었다. 처음 기준 이후 가져온 dev 커밋은 총 37개다.
- 직접 수정한 서비스 코드는 없다. `tests/park-xr/parkXR.spec.ts`의 테스트 대역에 최신 `GET /api/v1/announcements` 계약의 빈 공지 응답을 추가했다. 첫 XR 7개 실패는 해당 응답 누락의 404가 원인이었고, 기존 콘솔 오류 검사·검증·timeout은 유지했다.
- `16564b51` 통합 기준에서 앱/XR 타입 검사, FE 전체 단위 2,252개 통과(기존 6개 skip), BE 관련 46개 클래스 459개 통과(실패/skip 0), bootJar 빌드를 확인했다. BE에는 generated 맵 경로를 실제로 제공했으며 점프맵·협동·맵/공통 소켓·준비 잔액·오목·장부·작성 중 표시·공지·닉네임·문서/보안 회귀를 포함했다.
- 최종 `a9afd16b` 기준에서 앱/XR 타입 검사, 판돈·공통 HUD 관련 4개 파일 31개 단위 테스트, 협동 활성 공원 빌드, XR 브라우저 7개를 다시 통과했다. 두 dev 기준 사이 backend 트리는 동일함을 확인하여 BE 검사는 반복하지 않았다. 최종 추가 HUD 브라우저 전용 검사는 실행하지 않았다.
- 최신 맵 `c05d8ada…`와 코스 `5e03c470…` 검사 통과, 생성물 변경 0개. V148 공지 SQL은 최신 dev에 이미 있던 파일을 그대로 반영했다. 신규 migration 작성·번호 예약·DB 적용·Flyway repair/초기화는 하지 않았다.
- 브라우저 검사 환경은 기존 Playwright·Chrome/SwiftShader, `127.0.0.1:5289`, 1440×900 및 좁은 화면이다. Browser plugin not available. 페이지 식별·렌더링·오류 오버레이/앱 오류 없음, 입력·시점·중단 복구·안내·결과·랭킹·짧은 화면 스크롤을 확인했다. 모의 XR/REST/WS 검사이며 실제 Quest/OAuth/DB 지급 성공을 뜻하지 않는다. 기존 Three/SwiftShader·대형 chunk 경고는 남아 있다.
- 증거 PNG는 저장소 밖 `C:\Users\SSAFY\Desktop\OnTop\output\quest-vr-dev-sync-20261105\`에 보존한다. 실제 로그인용 설정은 사용자가 추후 제공하기로 한 상태를 유지하며 서버를 새로 기동하거나 배포하지 않았다.
- 기존 로컬 전용 조건과 원격 VR 보호를 유지한다. 직접 푸시·MR 생성·원격 머지·Jenkins 실행·브랜치 삭제는 하지 않는다. 원격 `VR@8ff32c58`과 로컬 통합 커밋은 구분한다.
