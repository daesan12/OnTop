# 온탑 윷놀이

- 작업 브랜치: `feat/yutnori`
- 기준: `origin/dev` `2aecab6531b06ec3c919726baf41cf75e31a059c`
- 사용자 승인: 전통놀이존 E 상호작용·게임 연결 변경 포함. 건물·지형·배치·충돌 데이터는 수정하지 않는다.
- 최신 220m 맵: `generated/park-renewal/server-map.json`, 버전 `bb13a432887f01ad46677d03810be2931b26c4c2df25b2b2130253615f833742`.
- 기존 `skewerCoopDemo`의 180m 맵 검수 결과는 사용하지 않는다.

## 동작과 계약

`전통놀이존 입구 → E → 윷놀이 카드 → 방 만들기/참가 → 팀 선택 → 전원 준비 → 방장 시작`.

게임 코드는 `YUTNORI`. 방을 만들 때 2~4팀과 팀별 말 1~4개를 선택한다. 최대 4명이 참가하며 선택한 모든 팀에 한 명 이상 필요하다. 같은 팀이 말을 공유하고, 같은 팀 안에서도 차례를 번갈아 맡는다. 무료 경기이며 판돈·지갑·보상을 변경하지 않는다. 방은 같은 공원 채널에서만 조회·참가한다. 서버는 현재 인증 소켓·맵 일치·시설/테이블 충돌·입구 위치를 확인한다.

대기 상태는 기존 인증 REST 전송 포트로, 시작 이후 입력은 기존 `GAME_ACTION_SEND`, `GAME_STATE_CHECK`, `GAME_RECONNECT_CHECK`, `GAME_FORFEIT`로 보낸다. 별도 WS 프로토콜·라우터·지갑을 만들지 않는다. 무료 세션 등록을 명시적으로 허용하며 공통 라우터의 사용자 점유 검사는 유지한다. `publicState.chat`에는 전체 대화만, 참가자의 `privateState.teamChat`에는 본인 팀의 대화만 담는다. 관전자의 개인 상태는 빈 객체다. 관전자는 서버가 허용한 같은 경기의 공개 상태만 읽으며 행동을 제출할 수 없다.

- 던지기 결과·낙·선공·목적지·포획·업기·완주는 서버 확정이다.
- 윷·모 이동권과 추가 던지기 기회를 보관하고 순서를 선택할 수 있다.
- 29칸: 바깥길 20개, 대각선 9개. 참먹이(20)에서 한 칸 이상 나가야 완주(30)다. 0은 출발 전이다.
- 모서리·중앙에서 이동을 시작할 때만 지름길을 선택한다. 빽도는 말의 실제 이동 이력을 거꾸로 따른다.
- 같은 편 도착 말은 자동으로 업는다. 도착 칸의 상대 스택 전체를 잡는다.
- 빈 판 빽도는 기본 무효. 선택하면 도 자리에 새 말을 놓는다.
- 윷·모 잡기는 기본 추가 기회 1회, 선택하면 중복 적용한다.
- 참먹이 빽도는 기본 실제 경로로 후퇴, 선택하면 완주다. 규칙은 생성 후 고정한다.
- 4개 윷면은 서버에서 균등 조합으로 생성한다. 디지털 낙은 던지기별 2% 확률이며 실제 물리 시뮬레이션이 아니다. 낙이면 보관 이동권·추가 던지기를 잃는다.
- 대표 윷 2개씩의 선공 순위: 모두 엎어짐 > 모두 젖혀짐 > 엇갈림. 동률은 다시 던진다.
- 한 차례 90초. 시간 초과·기권·접속 유예 만료는 해당 팀만 탈락시키고 말을 치운다. 남은 팀은 계속 진행하며 마지막 생존 팀이 승리한다. 탈락자는 공원으로 돌아가 다른 방에 참가할 수 있다.
- 대기방 10분 무활동 시 취소, 종료 기록 메모리 보관 30분. 진행 상태의 서버 재시작 복원은 지원하지 않는다.
- 동일 `actionId` 재전송은 같은 영수증, 다른 내용은 충돌이다. 낡은 `expectedVersion`, 다른 사용자 차례, 관전자 입력을 거절한다. FE는 응답 불명 입력을 보관하고 같은 ID로 재확인한다.
- 전체 채팅은 같은 경기의 참가자·관전자에게 공유하고, 팀 채팅은 경기 시작 후 같은 팀 참가자에게만 전달한다. 범위별 입력 초안을 분리하고 전송 실패 시 보존한다. 채팅과 판 위치 핑은 1초 간격·100자 제한이며 다른 경기에는 전파하지 않는다.

규칙 참고: 사용자가 제공한 내용과 [전통문화포털 윷놀이](https://www.kculture.or.kr/brd/board/682/L/menu/704?brdType=R&bbIdx=13683). 외부 사이트의 이미지·에셋은 복사하지 않았다.

## 독립 검증과 공원 검수 실행

기존 설치 의존성은 같은 프로젝트 lockfile에 맞는 `node_modules`를 재사용한다. 설정 파일을 수정하지 않고 기존 검수용 포트·Origin·프록시를 사용한다. 다른 작업이 해당 포트를 사용 중이면 종료하거나 교체하지 않는다.

```powershell
# backend/ 에서 실행
.\gradlew.bat --offline test --tests '*Yut*Tests' --tests '*GameEngineRouterTests' --tests '*TableHubSkewerEntryTests' mysqlRuntimeClasspathJar --console=plain
java -cp build/tmp/mysql-classpath/mysql-runtime-classpath.jar com.ssafy.ontop.game.yutnori.YutParkApplication

# 다른 터미널, frontend/ 에서 실행
node node_modules/vite/bin/vite.js --config vite.skewer-coop.config.ts --mode park-renewal-integration --host 127.0.0.1 --port 5244 --strictPort
node scripts/verify-yutnori.mjs
node node_modules/vitest/vitest.mjs run --config vitest.local.config.ts tests/local-unit/yutnori.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

테스트 계정 링크(실제 DB·외부 OAuth 회원 아님):

- `http://127.0.0.1:5244/yut-park.html?role=red` — 101 홍팀 로컬
- `http://localhost:5244/yut-park.html?role=green` — 202 청팀 로컬
- 관전 검수는 `?role=viewer` — 505 관전 로컬

실제 JWT 교환·인증 WS·현재 220m 맵·서버 이동·게임 엔진을 사용한다. 회원 조회·프로필·지갑은 기존 loopback fixture다. URL에 토큰·비밀번호를 넣지 않는다. 두 링크는 다른 호스트라 저장 공간도 분리된다. 새로 열면 해당 테스트 계정으로 새 소켓을 만들므로 같은 계정 링크를 여러 창에서 중복 접속하지 않는다.

전통놀이존 입구에 서버 배치된 뒤 E를 누른다. 공원으로 나온 뒤 WASD로 이동할 수 있다. 검수용 이동 버튼은 서버가 가진 최신 `folk` 접근점을 사용하고, 없는 맵이면 실패한다.

## V186 및 저장소

`backend/src/main/resources/db/migration/V186__create_yutnori_results.sql` 하나를 추가했다. `yutnori_results`에 종료 결과 JSON을 경기 ID 기준 멱등 저장하며 지갑·공통 판돈 세션에는 INSERT하지 않는다. 다른 Flyway 파일·location 설정은 변경하지 않는다. 2026-11-21 사용자가 V186은 공유 DB 미적용이라고 확인하고 같은 파일 통합을 요청하여, 이 파일의 승리 팀 CHECK를 -1/0/1/2/3으로 확장했다. 새 버전 파일은 추가하지 않았다.

사용자가 V186 사용을 지정했다. 생성 전 dev·모든 가져온 원격 브랜치/MR 참조와 로컬 worktree에서 V186 파일이 없음을 확인했다. MR 참조의 open/closed 상태와 별도 팀 예약은 확인 불가다. 실제 MySQL 8.4 및 DB 순차 적용·쓰기 검증은 담당자 확인이 필요하다. 로컬 fixture에서는 메모리 경기만 동작하며 DB 저장 성공으로 보고하지 않는다. DB 쓰기 실패는 주기적으로 재시도하지만 프로세스 종료나 보관 기간 만료 후 저장을 보장하지 않는다.

## 공통 변경

- `TableHub`: 기존 최신 맵·활동·소켓 검사 재사용 + `folk` 접근점 검사 추가.
- `parkInteraction`: 기존 전통놀이존 공사 안내를 E 카드 진입으로 분기.
- `ParkPage`: 지연 로딩된 게임 화면 연결. 팝업을 여는 동안 기존 공원 렌더 루프를 일시정지하고 닫으면 재개한다.
- `SpringParkRuntime`: 인증 REST 허용 경로와 윷놀이 복구/메시지 분기. 다른 게임 저장소로 상태를 흘리지 않는다.
- 기존 테스트 fixture에 loopback 세션 별칭과 최신 맵 접근점 배치만 확장했다.

맵 전수 탐색·자전거·킥보드 테스트는 추가·실행하지 않는다. UI 검수는 두 계정의 게임 진입·턴·재접속·기권·공원 복귀와 관전자 채팅/핑, 작은 화면·낮은 화면을 대상으로 한다. 실행 결과는 `VALIDATION.md`에 기록한다.

## 디자인과 에셋

`concept.png`는 최초 통합 때의 재료·색상 참고 자료다. 현재 인게임은 사용자 요청에 따라 오목처럼 중앙 판과 양쪽의 보조 레일로 개편했다. 기존 한지 원본 `/art/tablet/hanji.webp`, 먹색, 녹색 주 버튼과 둥근 이중 테두리를 재사용한다. 선택 카드는 두더지 선택 UI의 카드 구조, 방 화면은 꼬치왕의 생성·참가 흐름을 따른다. 중앙 판과 말은 실제 Three.js 입체 장면이며, 접근 가능한 네이티브 버튼을 카메라 좌표에 투영하여 조작한다. WebGL 실패 시 기존 SVG 판을 사용한다. 윷면 결과는 네이티브 UI를 유지한다. 장식으로 버튼 글자를 가리지 않는다.

Image Gen 내장 도구로 만든 `art/cover.webp`와 `art/board.webp`를 사용한다. 외부 미술품이나 사이트 이미지에 의존하지 않는다. 주요 프롬프트는 다음과 같다.

1. Concept: Korean OnTop multiplayer Yutnori full main screen, hanji ivory, forest green, gold double borders, square 29-node board, native UI controls, four blue/red tokens per team, throw and move controls, recent turns.
2. Cover: warm miniature 3D carved wooden four yut sticks with one marked backdo, red/blue tokens on ivory mat, Korean pavilion and pine, forest green/gold frame, no text.
3. Board: square top-down blank ivory linen mat, thick carved wooden frame with gold trim and corner knots; empty center for native interactive graph; no circles, lines, tokens or text.


## 다팀·칸 수·빽도 후속 수정

- 방 설정은 생성 시 확정하며 기본값은 2팀·말 4개다. FE/BE 공개 상태의 teamCount, pieceCount, eliminatedTeams를 함께 사용한다. 최대 4인 계약은 유지한다.
- 실제 윷판은 바깥 20 + 안쪽 9 = 29칸이다. 참먹이는 판 위의 한 칸이고 대기석과 완주 상태는 별도 칸으로 그리지 않는다. 대각선 25번 노드가 모서리처럼 크게 그려지던 오류를 고쳤다. 큰 표시는 모서리 4곳과 중앙 1곳뿐이다.
- 서버 이동은 첫 도 1칸, 바깥길 20칸째 참먹이, 그다음 1칸 완주로 검증한다. 최단 경로는 5+3+3으로 참먹이, 추가 1로 완주다. 완주 규칙은 사용자가 처음 정한 규칙을 따른다.
- 첫 윷의 평평한 면에 붉은 ‘빽’을 표시하고 둥근 면은 숨긴다. 결과에 ‘빽도·뒤로 1칸’과 항상 보이는 표식 안내를 제공한다.
- 확인 자료: [국립민속박물관](https://webzine.nfm.go.kr/2021/02/01/설날의-윷놀이-출발과-귀환의-즐거운-한-판/), [한국민족문화대백과사전](https://encykorea.aks.ac.kr/Article/E0042794), [한국문화원연합회 실제 윷판 사진이 있는 설명](https://www.kculture.or.kr/brd/board/682/L/menu/704?bbIdx=13683&brdType=R). 사진은 참고로만 열었고 제품에 복사하지 않았다.
- 다팀 브라우저 검수: frontend에서 node scripts/verify-yutnori-four.mjs. 기존 2팀 회귀는 node scripts/verify-yutnori.mjs.
- 네 번째 검수 계정은 기존 테스트 전용 fixture에 606을 추가했다. role=yellow로 접속하며 실제 회원 계정을 만들지 않는다. 다른 브라우저 context에서 role=viewer(505)를 세 번째 팀으로 참가시키면 4팀 검수가 가능하다.


## 중앙 윷판과 전체·팀 채팅 (2026-11-21)

- 경기 시작 후 YutMatchView와 yutFocus.css가 화면을 담당한다. 중앙 정사각형 판을 최대 크기로 배치하고 좌우 폭을 같게 두어 화면 중앙을 유지한다. 왼쪽은 팀 현황·채팅, 오른쪽은 던지기·이동권·최근 진행·접힌 규칙이다. 기존 목재/천 윷판 에셋과 네이티브 29칸·말·빽도 표식을 유지한다.
- 데스크톱에는 판·던지기·채팅 입력이 동시에 보인다. 작은 세로 화면은 판을 먼저 표시하고 상단 채팅 버튼으로 입력창에 바로 이동한다. 낮은 가로 화면은 팀 현황을 줄이며 각 스크롤 영역은 휠·터치·키보드 접근을 유지하고 스크롤바는 숨긴다.
- 인증된 POST /api/v1/minigames/yutnori/chat에 gameId, scope(ALL/TEAM), text만 보낸다. 팀/작성자/수신자를 클라이언트가 지정할 수 없다. 서버가 현재 참가·관전, 공원 연결, 팀, 시작 여부를 검사한다. 관전자·외부인·퇴장자의 팀 채팅은 거절한다. 팀 변경이 가능한 대기방은 팀 채팅을 허용하지 않는다.
- YutChat은 전체 메시지 60개와 팀별 메시지 40개를 각각 보관한다. 전체/팀 대화를 진행 로그에 섞지 않는다. GameStateChanged의 공통 개인별 조회·전송을 재사용하며 REST 조회, WS, 재접속에서도 같은 팀만 비공개 메시지를 받는다. 관전자는 privateState={}를 유지한다.
- 기존 종료 저장은 publicState만 기록하므로 팀 채팅이 결과 JSON에 들어가지 않는다. 팀 채팅은 서버 메모리에만 보관하며 서버 재시작 복원은 제공하지 않는다. V186과 DB 스키마는 이번 변경에서 수정하지 않는다.
- 공통 파일 변경은 SpringParkRuntime의 기존 윷놀이 인증 REST 허용 목록에 chat 한 경로를 추가한 것뿐이다. 맵·배치·입력·카메라·공통 WS/라우터·인프라 설정은 수정하지 않는다.
- YutChatTests가 동료/상대/관전/복구/퇴장, 범위·길이·빈도·보관량을 검증한다. FE 계약 검사와 실패 반환 테스트를 유지한다. 새 화면의 기준 시안 및 검수 캡처는 로컬 검수 폴더에 보관하며 제품 에셋으로 포함하지 않는다.

## 입체 윷판 (2026-11-21)

- `Board3D.tsx`는 기존 설치된 R3F/Three.js로 두꺼운 목재 판, 천 표면, 29개 칸, 네 팀의 입체 말을 렌더링한다. 기존 `board.webp`는 판 윗면의 재질로 재사용한다. 같은 팀이 업히면 말이 실제 높이로 쌓이고 숫자로 개수를 표시한다. 조명·그림자·착지 동작을 적용하되 이동 경로·잡기·완주는 서버 상태를 따른다. 윷 던지기의 물리 시뮬레이션은 추가하지 않는다.
- 카메라는 고정된 읽기 좋은 시점이며 화면 비율에 맞춰 판과 최대 4개 업힌 말이 들어오도록 계산한다. 원근으로 앞쪽이 커지는 외곽을 기준으로 화면 중앙에 맞춘다. 데스크톱은 중앙 영역 전체를 사용하고 작은 세로 화면은 기존 판 우선 순서를 유지한다.
- 클릭·키보드용 네이티브 버튼은 같은 카메라로 3D 칸과 말 윗면을 투영한다. 상대 말이 있는 목적지를 눌러도 이동을 제출한다. WebGL 생성 실패·context loss는 기본 SVG 판으로 전환하며 최신 상태와 콜백을 유지한다. 감소된 동작 설정에서는 착지 동작을 생략한다.
- 정지 상태는 demand 렌더링하고 DPR은 최대 1.5로 제한한다. 장면은 윷놀이 모듈 내부에 있으며 공원 맵·카메라·입력, BE·DB·V186, 의존성·인프라 설정은 변경하지 않는다.
- 독립 검수: FE 실행 후 `node scripts/verify-yutnori-3d.mjs`. 개발 전용 `tests/fixtures/yutBoard3dInteraction.tsx`를 브라우저의 HTML 응답에 연결하여 29칸, 업기, 목적지 클릭, 키보드 선택, 핑, 화면 크기, 강제 WebGL 상실 후 기본 판을 검사한다. 서버 상태를 조작하지 않는 UI fixture다. 캡처는 기본 임시 폴더에 저장하고 `YUT_QA_OUTPUT`으로 위치를 지정할 수 있다.
- 단위 검사: `node node_modules/vitest/vitest.mjs run --config vitest.local.config.ts tests/local-unit/yutnori.test.ts tests/local-unit/yutnori-3d.test.ts`.
