# 돌탑·건물·점프맵 QA — 2026-11-21

## 기준과 범위

- 작업 위치: `dev-review-20261121`, 브랜치 `fix/park-game-qa-20261121`.
- 시작 및 푸시 전 fetch에서 `origin/dev`는 `2aecab6531b06ec3c919726baf41cf75e31a059c`였다. 작업 이력에 포함되어 있으며 통합 충돌은 없었다.
- 앞선 공개 틀린그림찾기 방·탈것 요금·열기구 경고 작업의 4개 커밋 위에 이어지는 브랜치다.
- 사용자가 이번 두더지·VR 건물 외관과 건물 충돌 수정을 승인했다. 인프라 파일·설정·DB·Flyway는 수정하지 않았다. 보류된 열기구 4개 항목도 유지했다.
- 재생성한 공원 데이터는 기존 파일과 동일했다. 맵 계약은 `bb13a432887f01ad46677d03810be2931b26c4c2df25b2b2130253615f833742`이며 생성 파일 변경은 없다. 외관 소스와 서버의 던지기 충돌 처리만 변경했다.

## 변경

### 돌탑 생존전 (`STONE_RUMBLE`)

- 수동 드래그 감도를 `.008 → .003 rad/px`로 낮췄다. 최대 회전 속도는 자동 `1.6 rad/s`, 수동 `2.8 rad/s`이며 긴 프레임은 50ms로 제한한다. 관전 대상을 바꿀 때 카메라 초점을 즉시 이동하지 않는다.
- 최초 접촉 후 발판 붕괴 유예를 FE/BE 모두 `1200 → 2000ms`로 맞췄다. 재접촉으로 붕괴 시각을 연장하지 않는다. 마지막 400ms의 붉은 경고와 규칙·로딩·도움말 문구도 맞췄다.
- 100ms 간격 서버 위치 사이를 120ms 표시 버퍼로 이어 그린다. 캐릭터·카메라·붕괴하는 돌은 같은 표시 시간 정책을 사용한다. 지연 패킷에도 시간이 역행하지 않고, 패킷이 끊기면 마지막 서버 시각에서 멈춘다. 중력·착지·탈락 판정은 서버가 계속 담당한다.
- 담당 경로는 기존 `frontend/src/game/stone-rumble/`, `backend/.../game/stonerumble/`다. 메시지·인원·정산 계약 변경은 없다.

### 건물

- 두더지 망치: 금색 띠 아래까지 겹치던 붉은 원통을 줄여 같은 반지름의 옆면 중첩을 제거했다.
- VR 꼬치왕: 타일과 바탕 바닥의 깊이 간격을 확보했다. 화로의 바닥 빛은 바닥 위로 분리하고 밝기 맥동을 제거했다. 화염·연기·불꽃 효과는 유지한다.
- 공통 서버 물리 `WorldPhysics`: 던지는 동안 ghost 겹침 목록 대신 이동 경로 전체를 sweep한다. 공중 관통도 검사하며, 관통 시 직전 안전 위치, 유효한 가까운 지지면 순서로 복구한다. 모서리의 잘못된 착지도 검사한다. 정상 4cm 충돌 여유의 float 오차를 허용하는 0.1mm 오차 범위를 사용한다.
- 승인된 외관 소스 파일과 공통 물리만 수정했다. 건물 배치·기둥 형상·공원 이동 경로·맵 프로토콜은 유지한다.

### 두더지·비둘기 점프 발판

- 착지 변형이 단순 확대·이동인 두 테마에서 불필요한 `TessellateModifier`만 생략한다. 원본 정점 좌표·색·인덱스, 발판 크기·높이·충돌·움직임 곡선은 유지한다.
- 발판 한 세트 정점 수: 두더지 `4320 → 888`(약 79% 감소), 비둘기 `2184 → 588`(약 73% 감소). 전체 게임 FPS 향상률을 뜻하지 않는다.
- 공통 연결부는 기존 `features/jumpmap/landingMotion.ts`다. 다른 테마의 곡면 착지 표현은 유지한다.

## 검증

- BE: `gradlew.bat test --tests '*StoneRumbleMatchTests' --tests '*StoneRumbleEngineTests' --tests '*WorldCarryPhysicsTests' --tests '*WorldCarryTests' --tests '*WorldCarryFlowTests' --offline --max-workers=2 aiLabClasspath` — 115개 통과.
- 얇은 5cm 벽과 최신 공원의 팔각정 기둥에 실제로 던져 보는 물리 회귀를 서버 이동·클라이언트 위치 권한 모드에서 각각 추가했다. 종료 후 관통하지 않은 지지면을 검사한다.
- FE local-unit 7개 파일 33개: 카메라 속도/각도 경계, 낙하/착지/재접속 보간, 지연 패킷 시간 역행 방지, 기존 입력·관전·피드백·발판 버퍼, 망치 표면 중첩, 발판 원본 좌표 보존/정점 감소.
- FE 기존 unit 7개 파일 51개: avatarCarryMotion, carryMovement, carryInputOwnership, carryEscape, carry, jumpmapPhysics, jumpmapPresentation.
- `tsc --noEmit`, Vite build, `git diff --check` 통과. 빌드는 `.vite-cache/qa-feedback/dist-game-qa`에 두었다.
- 맵 전수 탐색 및 자전거·킥보드 주행 테스트는 추가하거나 실행하지 않았다.

### 실제 브라우저 및 독립 검증

- Browser plugin이 없어 Playwright + 기존 로컬 Chrome CDP를 사용했다.
- 최신 QA FE/BE에서 101·202 계정 로그인, 같은 `channel-1` 입장, 맵 계약 일치, 키보드 이동을 확인했다. 같은 일반 테이블 착석도 확인했다.
- 돌탑 전용 테이블 `table-17`까지 기존 길찾기는 경로를 반환하지 않았다. 돌탑의 실제 공원 진입 → 서버 경기 → 정산 → 공원 복귀를 이번 브라우저 검수에서 완료했다고 주장하지 않는다.
- 실제 `StoneRumbleScene`을 독립 렌더 fixture로 마운트했다. 자동 회전의 최대 프레임 각도는 `0.08 rad`, 400px 우클릭 드래그는 `-1.2 rad`였다. 100ms 위치 갱신에 따른 낙하와 아래층 표시를 확인했으며 pageerror는 없었다. 이 위치 데이터는 실제 서버 경기 스냅샷이 아닌 fixture다.
- 최신 공원에서 VR 바닥을 확대해 확인했다. 망치는 지붕을 일시 숨긴 브라우저 검수 상태에서 확대했다. 테스트 상태는 새로고침으로 제거했다.
- 점프맵은 두 테마에 한정한 3인칭 렌더 fixture로 확인했다. 1440×900, 로컬 하드웨어 Chrome에서 두더지 중앙 프레임 간격 약 8.7ms / p95 25ms, 비둘기 약 16.6ms / p95 25ms였다. 측정은 각 2초의 짧은 표본이며 전후 FPS 비교나 실서버 주행 결과가 아니다. 실제 서버의 두 구간 연속 주행·저사양 기기 체감은 미확인이다.
- 스크립트·스크린샷은 워크스페이스의 `.qa-feedback-20261121/`에 있다: `stone-motion-render.cjs`, `building-visual.cjs`, `jump-targeted.cjs`, `stone-camera-smooth.png`, `stone-falling-buffer.png`, `vr-floor-depth.png`, `mole-hammer-isolated.png`, `jump-third-person-mole.png`, `jump-third-person-pigeon.png`.

## 로컬 확인

- FE 5511, BE 19193을 유지한다. 기존 다른 작업의 5501/19191 서버는 건드리지 않았다.
- 계정 1: `http://127.0.0.1:5511/stone-rumble-park.html?role=1`
- 계정 2: `http://127.0.0.1:5511/stone-rumble-park.html?role=2`
- 각 링크를 별도 탭으로 연다. 링크에서 교환 코드를 받아 메모리 토큰으로 로그인하며 URL·채팅에 토큰을 싣지 않는다.
- 이동 WASD, 점프 Space, 시점 V, 지도 M. 두더지는 지도 서쪽 놀이숲, VR 꼬치왕은 그 북쪽 건물이다. 돌탑 전용 진입은 북쪽 높은 구간의 비석 옆 테이블 `table-17`이다.
- 계정·지갑/정산은 이전 작업의 테스트 메모리 fixture이며 실제 회원·운영 재화·외부 OAuth/운영 DB와 연결하지 않는다. 공원 통신·물리 및 돌탑 엔진은 실제 애플리케이션 코드를 사용한다. DB가 필요한 점프맵 등 일부 API는 이 서버에서 제공되지 않는다.
- MR·머지는 사용자 명시 요청 전까지 보류한다. 작업 브랜치는 유지한다. Jenkins는 접근 수단/권한이 없어 확인하지 못했다.
