# 길목 한 수 입체 테이블과 공통 HUD

## 기준과 승인 범위

- 작업 브랜치: `feat/quoridor-table`. 기준 dev는 `2aecab6531b06ec3c919726baf41cf75e31a059c`이며 작업 이력에 포함되어 있다.
- 2026-11-21 사용자가 테이블 외관·게임 카메라 변경을 포함한 진행을 명시적으로 승인했다.
- 게임 내부 `gameCode: QUORIDOR`, 규칙·시작·예약·정산·복구·관전 WS 계약은 유지한다. BE 및 V185는 변경하거나 적용하지 않는다.
- 기존 시설 앵커·좌석·충돌·이동 경로·생성 맵 데이터·FE/BE 맵 버전 계약·인프라 설정은 수정하지 않는다.

## 실제 공원 연결

`TableBoards`에 `ParkQuoridorBoard`를 등록했다. 최신 `TableShell`의 테이블 로컬 좌표와 `tableScale`을 사용한다. 공개 게임 선택이 길목 한 수이면 대기 보드를 표시하며, 승인된 참가자·관전자만 받은 경기 상태를 연결한다. 일반 사용자가 경기 상태나 조작 권한을 얻는 경로를 추가하지 않는다.

게임판은 공원의 기존 WebGL Canvas 안에서 렌더링한다. 전체 화면 DOM 게임판과 SVG 말은 제거했다. 둥근 목재 트레이, 틈이 있는 81개 입체 타일, 선반 가공 형태의 말, 세워진 장벽, 말 이동 궤적, 골드 이동 표시·반투명 장벽 미리보기·관전자 추천 링을 사용한다. 타일은 InstancedMesh 하나로 묶는다. 목재는 오목의 기존 PBR 재질을 재사용한다.

서버의 칸 `(0..8,0..8)`과 장벽 `(0..7,0..7)`을 로컬 3D 좌표로 변환한다. 장벽 길이는 정확히 두 칸이다. Raycast 대상·버전이 누르는 시점과 놓는 시점에 같을 때만 행동하며 드래그·pointercancel·화면 이탈은 취소한다. 이동·장벽·핑의 실제 권한과 합법성은 기존 서버가 판정한다.

`CameraRig`는 기존 오목 집중 레이어·조명·전환 보간을 사용한다. 약 60도 내려다보는 투시 카메라가 자신의 출발선 쪽에서 보며, 좌석에 따라 서버 좌표 자체를 회전하지 않는다. 판 두께와 말 높이를 포함한 범위를 측정한 HUD 여백 안에 맞춘다. 주변 보기·관전 해제·종료 후에는 기존 공원 카메라 흐름으로 돌아간다. 기권 잔해의 기존 우선순위는 유지한다.

## UI와 관전

- 기존 공통 게임 메뉴·관전자 수·기권 확인·설명서를 사용한다. 차례 제한 시간이 없는 규칙이므로 가짜 타이머를 추가하지 않는다.
- 상단에 참가자·남은 장벽·현재 차례, 하단에 이동/장벽 방향/설치 확정을 둔다. 화면 전체를 한지 패널로 덮지 않는다.
- 기존 공원의 `ParkChat`을 그대로 사용한다. 경기 채팅의 범위·필터·입력 소유권·실패한 입력 보존·최근 기록 스크롤도 공통 경로를 따른다. 별도 게임 채팅 입력창을 중복 생성하지 않는다.
- 관전자는 입체 판의 칸을 눌러 훈수 핑을 보낸다. 1초 간격·2초 표시·이름/좌표·낡은 버전 제거는 기존 이벤트 계약을 유지한다.
- 작은 화면은 참가자 상태를 두 줄로 배치하고, 낮은 가로 화면은 좌우 UI 영역 사이에 판을 맞춘다. 게임 메뉴·조작 목록의 스크롤바는 숨기되 실제 스크롤과 키보드 접근은 유지한다.
- 키보드 사용자에게는 가능한 이동·장벽 선택 버튼을 제공한다. 이 버튼은 포커스를 받으면 표시되며 서버 권한을 우회하지 않는다.

## 담당 경로와 공통 변경

게임 전용 파일은 `frontend/src/game/quoridor/`에 둔다.

- `QuoridorScene.tsx`: 입체 판·말·장벽·추천 표시와 pointer picking.
- `presentation.ts`, `camera.ts`: 서버 좌표 변환·치수·게임 카메라·HUD 프레이밍.
- `controls.ts`: 기존 session/game/recovery/관전 범위에서 UI 조작 상태를 계산한다.
- `ParkQuoridorBoard.tsx`: 실제 테이블 바인딩 및 기존 runtime 입력 연결.
- `QuoridorPanel.tsx`, `quoridor.css`: 투명 HUD·공통 메뉴·관전 피드.
- `preview.tsx`: DEV + loopback 전용 독립 UI fixture.

공통 수정은 `features/tables/TableBoards.tsx`의 렌더 등록, `world/CameraRig.tsx`의 경기별 카메라 분기, `park/runtime/ParkRuntime.tsx`의 소켓을 시작하지 않는 기존 Context provider 노출이다. 실제 공원의 기존 runtime provider 동작은 변경하지 않는다.

## 독립 실행과 제한

현재 실행 중인 FE 서버는 `http://localhost:5275`다.

- 4인 화면: `http://localhost:5275/gilmok-board-preview.html`
- 2인 화면: `http://localhost:5275/gilmok-board-preview.html?players=2`
- 관전 화면: `http://localhost:5275/gilmok-board-preview.html?role=spectator`

프리뷰는 실제 렌더러·HUD·공통 채팅 UI를 사용하지만 메모리 fixture이며 공원·인증·WS·DB에 연결하지 않는다. 표시된 합법 수 중 첫 행동 한 번을 검수하고 초기화할 수 있다. 전체 경기 규칙·BFS·금전 정산을 프리뷰가 대신하지 않는다. 관전 핑과 채팅은 이 브라우저 페이지 안에서만 확인한다. 생산 빌드의 앱 진입점에서는 프리뷰를 불러오지 않으며 DEV 및 localhost 검사를 통과해야 실행한다.

실제 공원 검수 진입점은 다음과 같고, 계정마다 별도 브라우저 프로필이 필요하다.

- 참가자 하나: `http://localhost:5275/gilmok-park.html?role=red`
- 참가자 둘: `http://localhost:5275/gilmok-park.html?role=green`
- 관전자: `http://localhost:5275/gilmok-park.html?role=viewer`

실제 공원 진입·이동·테이블 통합 검수는 미완료다. 마지막 검수에서도 서로 다른 두 브라우저 세션의 red/green 모두 mapContractStatus=mismatch, roomId 공백과 공원 입장 중단 안내를 확인했다. 초기 페이지 로딩 시간 초과 뒤 상태를 확인했으며 BE health는 200 UP이었다. 위 링크를 로그인·공원 입장 완료 링크로 표시하지 않는다. 인프라 담당자가 FE 5275·BE 19205의 최신 동일 맵 source/JSON/manifest 및 V185 적용 현황을 확인한 뒤 실제 두 참가자와 한 관전자 흐름을 검증해야 한다. 맵 일치 검사를 끄거나 이전 맵으로 실행 모드를 바꾸지 않았다.

## 검증

- FE 관련 10개 파일 64개 테스트 통과. 새 테스트는 두 칸 장벽 좌표·네 목표 방향·세 가지 화면 크기·서로 다른 테이블 배율의 프레이밍·종료 카메라 반환을 검증한다. 기존 오목/알까기 카메라·조명·관전·테이블 표시·설명서 회귀를 포함한다.
- `tsc --noEmit` 통과. `vite build --mode park-integration` 통과. 맵 생성 pre-script는 실행하지 않았다.
- Browser plugin 부재로 설치된 Chrome을 Playwright로 사용했다. 최종 새 브라우저 세션의 page error와 Vite 오류 overlay는 0이다. 기존 Three.Clock/PCFSoftShadowMap 경고 및 빌드의 Three CJS·큰 chunk 경고는 남는다. 의존성·환경 설정을 변경하지 않는다.
- 실제 canvas에서 말 이동, 가로·세로 장벽 선택/설치, 재고 감소, 관전 E7 추천, 공통 채팅, 주변 보기/판 복귀를 확인했다. 휴대폰 터치 이동·장벽 설치도 확인했다.
- 1536×1024, 390×844(2인·4인), 800×450을 확인했다. 작은 화면 가로 scrollWidth는 각각 390, 800으로 viewport와 같고 메뉴 scrollbar-width는 none이다.
- 공통 Context 파일이 갱신되는 개발 중 HMR 오류는 새 브라우저 세션에서 재검증했다. 최종 세션에서 재현되지 않았으며 위 오류 0 결과는 새 세션 기준이다.
- 맵 전수 탐색·자전거·킥보드 주행 테스트는 추가하거나 실행하지 않았다. 실제 헤드셋 검수는 하지 않았다.

주요 명령은 `node node_modules/typescript/lib/tsc.js --noEmit`, `node node_modules/vitest/vitest.mjs run tests/unit/quoridorPresentation.test.ts` 및 관련 기존 테스트, `node node_modules/vite/bin/vite.js build --mode park-integration --outDir <저장소 밖 검수 산출물 경로>`다.

## 디자인 비교 기록

기본 Image Gen 도구로 전체 1536×1024 시안을 생성했다. 프롬프트는 9×9 입체 목재 판·네 말·두 칸 길이의 세워진 장벽·약 60도 카메라·중앙 판·상단 참가자·작은 상태판·공통 메뉴·하단 조작·가장자리 채팅을 지정하고 전체 한지 패널과 타이머를 금지했다. 실물 메시가 필요하다는 사용자 요구에 따라 판을 비트맵으로 대신하지 않고 기존 목재 맵과 실제 3D 형상을 사용했다.

산출물은 저장소 밖 `OnTop/output/gilmok-3d-20261121/`에 둔다. `concept.png`와 `desktop-final.png`를 같은 QA 단계에서 view_image로 비교하고, `mobile-final.png`, `mobile-four-final.png`, `low-screen-final.png`, `spectator-ping.png`도 확인한다.

| 비교 항목 | 구현 결과 |
| --- | --- |
| 입체감 | 트레이 두께·타일 틈·장벽 높이·회전 대칭 말·접촉 그림자를 실제 mesh로 구현 |
| 화면 구성 | 중앙 보드, 가장자리 HUD, 전체 화면 2D 패널 제거 |
| 색·재질 | 기존 오목 PBR 목재·공통 녹색/황토/한지 UI 재사용 |
| 글·조작 | 실제 차례·장벽 재고·선택 좌표·확정/비활성 상태를 읽을 수 있게 표시 |
| 화면 크기 | 휴대폰 상단 재배치, 낮은 가로 좌우 UI 영역, 실제 터치 픽킹 검수 |
| 시안과 의도적인 차이 | 사용자 요청인 기존 UI를 우선하여 시안의 어두운 상태판 대신 공통 한지 상태판, 시안의 별도 채팅 대신 실제 ParkChat을 사용 |

시안의 예시 말 배치·추천 문구는 서버 좌표와 사용자의 출발 방향에 맞춰 표시한다. 인터페이스 문구·버튼·상태는 이미지에 구워 넣지 않는다. 촬영한 프리뷰 화면은 실제 공원에 접속한 완료 화면이 아니다.
