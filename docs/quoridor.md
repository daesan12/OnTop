# 길목 한 수 테이블 게임

## 현재 화면: 공원 입체 테이블

2026-11-21 사용자가 테이블 외관·카메라 변경을 명시적으로 승인했다. 전체 화면 DOM 판을 공원 Canvas의 3D 보드·말·장벽과 오목/알까기 공통 HUD로 교체했다. 현재 구조·독립 프리뷰·검증 및 실제 공원 미확인 범위는 [입체 테이블 기록](quoridor-3d.md)을 따른다. 아래 2D 화면 검수는 변경 전 구현 이력이다.

## 2026-11-21 관전자 훈수·채팅 보완

- 기준 dev: `2aecab6531b06ec3c919726baf41cf75e31a059c`. 최신 dev가 작업 브랜치 이력에 포함됨을 확인했다.
- 공원 테이블의 기존 관전 승인과 공개 상태 조회를 재사용한다. 관전 화면에 ‘관전 중’, 칸 클릭 안내, 추천자·좌표, 전송 중·대기·실패 안내를 표시한다. 말 이동·장벽 설치 권한은 열지 않는다.
- 추천은 승인된 관전자만 1초 간격으로 보낸다. 참가자와 같은 경기 관전자에게 2초 동안 표시하고 새 판 버전·관전 해제에 정리한다. 현재 경기 채팅은 참가자와 관전자가 서로 읽고 보낼 수 있으며 주변 공원 채팅으로 우회하지 않는다.
- 채팅 전송 중에는 중복 제출을 막고 실패한 입력은 유지한다. 최대 100개 경기 대화를 스크롤로 확인하고, 이전 대화를 읽는 동안 강제로 맨 아래로 이동하지 않는다. 입력 중 공원 키 조작을 막는다.
- 공통 수정은 `frontend/src/game/omok/spectatorEvents.ts`의 선택적 9칸 경계·좌표 표기와 `SpringParkRuntime.ts`의 해당 경기 범위 설정이다. 기본 오목 15칸 계약은 유지한다. 서버 이벤트는 기존 `GAME_SPECTATOR_CHAT_SEND`와 `OMOK_SPECTATOR_PING_SEND`를 그대로 쓰며 BE production 라우팅은 수정하지 않는다.
- GameCode는 계속 `QUORIDOR`다. 맵·배치·카메라·시설·인프라·DB 변경과 신규 migration은 없다. 당시 V185 초안(현재 V186)은 변경하거나 적용하지 않았다.

검증 결과:

- FE 5개 파일 45개 통과: 게임 상태, 9칸 추천 경계·A9/I1 표기·버전·권한, 기존 오목/알까기 이벤트와 설명서 회귀. `tsc --noEmit` 통과.
- BE 3개 클래스 38개 통과: 신규 `QuoridorSpectatorFlowTests` 1개, 공통 이벤트 protocol 29개·policy 8개. 실제 인증 티켓 → 테이블 시작 → 엔진 → 관전 승인 → 채팅/추천 방송 → 관전 해제를 검증했다. 미승인자·플레이어 핑·보드 밖 좌표·낡은 버전·연속 전송을 거절하고 판/버전 불변과 privateState 공백을 확인했다. 위치·시간·예약/정산은 격리 테스트 대역이며 최신 공원의 이동·지갑 검증을 대신하지 않는다.
- `vite build --mode park-integration` 통과. 기존 Three CJS 및 큰 chunk 경고가 남는다. 맵 생성 pre-script는 실행하지 않았다.
- Browser plugin 부재로 Chrome + Playwright를 사용했다. 4인 공개판을 사용하는 독립 UI fixture에서 관전자 채팅/핑 → 참가자 표시, 2초 만료, 새 버전의 지난 추천 제거, 실제 게임 입력 0건, 실패한 채팅 보존과 수동 재전송, 채팅 입력 소유권과 연결 끊김 후 비활성화를 확인했다.
- 1366×900 데스크톱, 390×844 세로, 800×450 낮은 가로 화면을 확인했다. 작은 화면의 client/scroll 너비는 각각 378/378, 780/780이고 scrollbar-width는 none이다. 마지막 채팅 입력과 관전 종료에 스크롤로 접근했으며 종료 후 패널 제거를 확인했다. 앱 page error와 Vite 오류 overlay는 없었다.
- 실제 공원 두 독립 세션의 이번 재접속은 초기 로딩 시간 초과·빈 본문으로 공원 진입을 확인하지 못했다. 이전에 확인한 FE/BE 맵 불일치는 담당자 조치 확인 전까지 미해결로 기록한다.
- 시각 증거: 저장소 밖 `OnTop/output/gilmok-20261121/spectator-social.png`, `social-mobile.png`, `social-low-screen.png`. UI fixture는 실제 공원·로그인·서버 미연결임을 화면에 표시하며 검수 뒤 임시 진입 파일을 제거한다.

실제 공원 링크는 아래 실행 절의 두 계정과 추가 `role=viewer`를 사용한다. 참가자 두 개와 관전자 한 개는 서로 다른 브라우저 프로필로 열고 같은 채널에서 진행 중인 테이블을 관전한다. FE/BE 맵 계약 불일치 처리 전에는 로그인 완료·공원 이동·실제 공원 관전 통합을 검증했다고 표시하지 않는다.

## 2026-11-21 이름 변경과 실제 테이블 검수 재개

사용자 요청에 따라 공개 게임 이름을 **길목 한 수**로 변경했다. 게임 선택·경기 제목·설명서·전적·오류 안내와 로컬 문서 제목에 적용한다. 기존 정산·복구·저장 계약의 식별자인 `QUORIDOR` 및 소스 경로는 유지한다. 당시 V185 초안(현재 V186)의 실행 SQL은 변경하지 않았으며 게임 이름 변경용 migration을 새로 만들지 않았다.

원래 이름이 새겨진 사진 썸네일은 배포 에셋에서 제거하고, 글자·로고·브랜드 각인이 없는 새 목재 보드 썸네일 `frontend/public/art/quoridor/thumbnail.webp`로 교체했다. 사용자 원본 사진은 수정하지 않는다. 새 검수 진입점은 `http://localhost:5275/gilmok-park.html?role=red` 및 `role=green`이다. 이전 로컬 HTML 진입점도 새 표시 이름으로 접근할 수 있다.

실제 테이블의 연결 순서는 다음과 같다.

1. 두 계정이 같은 공원 채널에 들어간다.
2. 일반 게임 테이블 가까이에서 E로 각자 빈자리에 앉는다. 돌탑 전용 테이블은 대상이 아니다.
3. 방장이 ‘길목 한 수’, 2인 또는 4인 정원, 참가비를 정하고 ‘선택하고 준비하기’를 누른다.
4. 참가자 전원이 ‘준비 완료’를 누르면 방장이 ‘게임 시작’을 누른다.
5. 기존 테이블 시작 서비스가 예약 커밋을 확인한 후 이 게임 엔진을 생성한다. 클라이언트가 독립 fixture 판을 생성하는 방식이 아니다.
6. 경기 종료 후 기존 테이블 결과·정산 화면을 사용한다.

공원 접속 검수 중 실행 중인 테스트 JVM이 재컴파일 전 클래스를 참조해 `TableProtocol$Response` 로딩에 실패한 것을 확인했다. 컴파일 완료 후 이 작업의 테스트 JVM만 기존 실행 설정 그대로 재시작했고 health UP을 확인했다. 맵 source/path/require-match 설정은 변경하지 않는다.

재시작 후 실제 Chrome(1366×900)에서 새 `gilmok-park.html?role=red` 진입점을 다시 확인했다. 화면은 렌더링되지만 `mapContractStatus: mismatch`, 공원 입장 중단 안내가 표시되며 room/session은 비어 있다. 따라서 이동·착석·경기 시작 검증은 계속 미완료다. 맵 계약 검사를 우회하지 않았으며 담당자에게 동일한 최신 맵 source/JSON/manifest 정렬과 당시 V185 초안(현재 V186)의 적용 현황 확인을 요청했다. F1 → 게임 찾아보기 → 길목 한 수를 실제로 클릭해 새 제목·썸네일과 테이블 진입 설명을 확인했다. page error와 개발 오류 overlay는 없었다. 증거는 저장소 밖 `OnTop/output/gilmok-20261121/park-map-blocked.png`, `manual-renamed.png`다.

이름 변경과 테이블 진입 설명서 추가 후 FE 관련 5개 파일의 기존 테스트 67개, BE 길목 게임 25개 테스트, 타입 검사와 park-integration Vite 빌드가 통과했다. 기존 Three CJS·큰 chunk 경고는 유지된다.

## 기준과 범위

- 기준: `origin/dev` `2aecab6531b06ec3c919726baf41cf75e31a059c`.
- 작업 브랜치: `feat/quoridor-table`. 기존 작업은 보존하고 별도 `quoridor-table-20261121` worktree에서 개발한다.
- FE: `frontend/src/game/quoridor/`. BE: `backend/src/main/java/com/ssafy/ontop/game/quoridor/`.
- 기존 테이블의 게임 선택 → 준비 → 예약 커밋 → 엔진 생성 → 결과·정산 흐름을 사용한다.
- 공원 시설 좌표·충돌·맵 데이터·맵 버전은 유지한다. 승인된 범위에서 테이블의 월드 Canvas에 입체 보드·말·장벽을 표시하고 게임 카메라를 연결한다.
- 2026-11-21 사용자가 공통 기권 연출·잔해 연결을 명시적으로 승인했다. 2인 명시적 기권 시 기존 탁자·엽전 잔해를 사용한다. 별도 길목 한 수 말·장벽 잔해는 추가하지 않는다.
- CI/CD·Jenkins·환경 설정 파일은 수정하지 않는다. MR·머지는 명시적 요청 전까지 보류한다.

공통 변경은 BE의 `TableGame`, `TableRoom`, `GameStartCommand`, `CommittedGameStartService`, `VerifiedGameFinish`, `TableHub`, 전적 요청/컨트롤러와 FE의 경기 protocol/store/panel, runtime 포트, 태블릿/기본 로비/결과 모델, 설명서, 전적, 기권 연출·잔해 수신, 차례 효과음 연결이다. 기존 라우터·공통 WS 프로토콜·지갑·정산 persistence를 복제하거나 수정하지 않는다.

## 규칙

9×9 보드의 북·남 중앙에서 시작하는 2인은 장벽 10개씩, 북·동·남·서 중앙에서 시작하는 4인은 장벽 5개씩 가진다. 3인은 허용하지 않는다. 서버가 선공을 추첨하고, 보드의 북→동→남→서 방향으로 차례를 진행한다.

한 차례에 상하좌우 이동 또는 장벽 하나 설치만 할 수 있다. 붙어 있는 말 하나의 뒤칸이 비어 있고 장벽이 없으면 직진 점프한다. 뒤가 장벽·보드 끝·다른 말로 막혀 있으면 그 말의 옆 빈칸으로 회피한다. 두 말을 연속으로 뛰어넘지 않는다. 자신과 인접 말 사이가 장벽이면 점프할 수 없다.

장벽은 두 칸 길이다. 같은 방향의 부분 중첩과 같은 교차점에서의 가로·세로 교차를 금지한다. 설치 전에 모든 활성 참가자의 목표 끝줄까지 경로를 BFS로 확인한다. 이 경로 검사는 말의 일시적 점유를 제외한다. 이미 설치한 장벽은 회수할 수 없다.

맞은편 끝줄의 아무 칸에 도착하면 즉시 승리한다. 기권한 말은 제거하고 장벽은 보존하며, 한 명만 남으면 그 사람이 승리한다. 사용자 추가 지시에 따라 각 차례는 30초이며, 만료 시 서버가 합법적인 말 이동을 자동 실행한다. 목표까지 장벽 우회 거리가 짧은 칸을 우선하고 동률은 y·x 순이다. 시간 초과 패배는 없다. 연결 끊김에는 기존 공통 재접속 유예와 만료 처리를 사용한다.

## FE/BE 계약

- `gameCode`: `QUORIDOR`.
- 인원: 정확히 2 또는 4. 태블릿 인원 선택·테이블 자동 시작·시작 명령·엔진 생성·종료 검증·DB 제약에서 확인한다.
- 공통 `GAME_ACTION_SEND`: `gameId`, `actionId`, `expectedVersion`, `input`.
- 이동: `{ "kind": "move", "x": 4, "y": 1 }`.
- 장벽: `{ "kind": "wall", "x": 3, "y": 2, "orientation": "HORIZONTAL" }`. 방향은 `HORIZONTAL` 또는 `VERTICAL`.
- 북서쪽 칸이 `(0,0)`이다. 말 좌표는 0–8, 장벽 좌표는 0–7이며 해당 교차 홈 북서쪽 칸을 뜻한다.
- 공개 상태: `gameCode`, `boardSize`, `version`, `status`, `players`, `walls`, `legalMoves`, `legalWalls`, `turnUserId`, `turnDeadline` (진행 중 서버 UTC ISO 시각, 종료 후 null), `winnerUserIds`, `endReason`, `endedAt`.
- 참가자: 문자열 `userId`, `x`, `y`, `goal`, `wallsRemaining`, `active`.
- `privateState`는 참가자·관전자 모두 `{}`. 합법 수 미리보기는 서버가 계산한 공개 정보다.
- 같은 사용자·경기·actionId의 같은 입력은 원래 결과를 반환한다. payload나 expectedVersion이 다르면 충돌로 거절한다. 낡은 버전·다른 차례·다른 참가자·잘못된 좌표는 거절한다.
- 같은 경기 생성 재호출은 참가자 순서와 테이블까지 같아야 한다. 종료·정산 이벤트는 경기당 한 번만 발행한다.
- 종료 사유: `GOAL_REACHED`, `LAST_PLAYER_STANDING`. 지갑·예약·정산은 기존 공통 경로만 사용한다.
- 관전 채팅은 `GAME_SPECTATOR_CHAT_SEND`를 사용한다. 위치 추천은 기존 좌표형 `OMOK_SPECTATOR_PING_SEND`/`OMOK_SPECTATOR_PING` 전송을 재사용하되 서버에서 길목 한 수 좌표 0–8을 별도로 검증한다. 관전자 권한·경기 범위·버전·빈도 제한도 기존 경로를 따른다.
- 참가자 종료 후에는 공통 테이블 결과 화면으로 돌아간다. 관전자는 최종 판과 관전 종료를 사용할 수 있다.
- 서버 프로세스 재시작 후 진행 중 판 복원은 지원하지 않는다.

## Migration

2026-11-22 사용자 지시에 따라 이 작업에서 DB에 적용하지 않은 V185 초안을 V186으로 변경했다. 현재 파일은 `backend/src/main/resources/db/migration/V186__allow_quoridor_game_sessions.sql` 하나다. 실행 SQL은 같으며 파일명과 버전 안내 주석만 바꿨다.

변경 전 최신 `origin/dev` `f3980669e3d6a5c02d2472188a69d149932fbf94`, 원격 참조 276개와 로컬 worktree 246개를 확인했다. dev에는 V182까지 있으며 최초 조사에서 V186은 윷놀이와 충돌했다. 사용자가 윷놀이를 V187로 조정 중이라고 확인한 뒤 진행했고, 윷놀이 로컬 파일의 V187 변경도 확인했다. 최초 확인 당시 윷놀이 원격에는 구 V186이 남아 있었지만, 커밋 전 최종 fetch에서 원격도 V187로 변경된 것을 확인했다. 통합 직전에도 번호를 재확인한다. 열린 MR 조회는 HTTP 404여서 외부 MR·팀 예약 전체와 외부 DB 적용 이력은 확인하지 못했다. 실제 DB는 적용하지 않았다.

번호 변경 검증: 주석을 제외한 실행 SQL이 기존 초안과 동일하고 현재 작업의 전체 DB locations 74개 migration에 중복 버전이 없음을 확인했다. `processResources` 통과 후 빌드 리소스에는 V186만 있고 구 V185 파일은 없다. 최신 dev 통합 회귀는 FE 9개 파일 60개 테스트·타입 검사가 통과했다. DB 적용·repair·초기화는 실행하지 않았다.

최종 재검사(원격 276개 참조·로컬 worktree 247개)에서는 원격 V186 파일이 없고 로컬 V186은 이 작업의 파일 하나뿐이었다. 윷놀이 원격 파일은 V187로 확인했다.

아래 두 문단은 최초 V185 작성 당시의 조사 기록이다.

생성 전 원격 참조 54개와 로컬 worktree 232개를 확인했다. V185는 없었고 다른 로컬 작업에 V183(다빈치 코드), V184(루미큐브)가 있었다. 열린 MR 조회는 HTTP 404로 실패했으며 외부 팀 예약은 확인하지 못했다. 번호를 별도 팀 채널로 전송하지 않았다.

최종 원격 갱신 후에도 dev 기준 커밋은 같았고, 로컬 worktree 235개에서 V185는 이 작업의 파일 하나만 확인했다. GitLab API의 별도 토큰 인증 조회도 HTTP 401로 거절되어 열린 MR 및 Jenkins 연계 빌드 결과를 확인하지 못했다.

현재 V186은 `information_schema.CHECK_CONSTRAINTS`의 현재 `ck_game_sessions_players` 식을 보존하고 길목 한 수 2인·4인 조건을 OR로 추가한다. 먼저 적용된 V183/V184 등의 게임 허용 조건을 과거 V180 정의로 덮지 않는다. 적용된 migration은 수정하지 않는다. 기존 제약이 없으면 실패하며 자동 repair·초기화를 하지 않는다.

실제 DB 적용은 하지 않았다. MySQL 8.4 신규 DB 적용·기존 DB 순차 적용·CHECK 보존·실제 금전 정산 검증은 인프라 담당자 처리와 DB 접근 후 진행해야 한다. 기본 `db` profile은 `DB_MIGRATION_LOCATIONS` 또는 `db/migration`, `dev & db`는 `db/migration,db/minigame`을 사용하지만 실행 환경의 실제 값은 확인하지 못했다.

## 실행과 검수 상태

기존 FE 의존성을 재사용했다. 버전·lockfile·Vite·Gradle 설정은 변경하지 않았다.

FE 실행(이 작업 서버 포트 5275):

```powershell
cd frontend
$env:API_PROXY_TARGET='http://127.0.0.1:19205'
node node_modules/vite/bin/vite.js --host localhost --port 5275 --strictPort --mode park-integration
```

BE는 기존 `aiLabClasspath` 작업으로 test runtime classpath를 생성한 뒤 `com.ssafy.ontop.demo.QuoridorParkApplication`을 실행한다. Windows 명령 길이 제한을 피하려면 Java argfile을 사용한다. 이 테스트 앱은 loopback 19205 포트, 테스트 profile, 메모리 계정·시작/정산 fixture만 사용하며 운영 JAR에 포함되지 않는다. 실제 게임 엔진·공통 소켓·권한 경로는 사용한다.

계정은 하나(101), 둘(202), 셋(303), 넷(404), 관전(505)이다. 링크에 비밀번호·토큰을 넣지 않는다.

- `http://localhost:5275/gilmok-park.html?role=red`
- `http://localhost:5275/gilmok-park.html?role=green`
- 4인 추가 역할: `role=third`, `role=fourth`. 관전 역할: `role=viewer`.

**위 링크는 공원 입장 검증 완료 링크가 아니다.** 브라우저에서 FE generated map(`de8b51d7…`)과 BE 기본 legacy map의 계약 불일치를 확인해 공원 입장이 차단되었다. 이전 맵으로 실행 모드를 바꾸거나 서버의 map source/path/require-match를 임시 변경하는 우회는 하지 않았다. 최신 승인 맵의 동일 JSON·manifest를 사용하는 검수 실행 환경을 인프라 담당자에게 요청했다. 처리 전에는 두 계정의 공원 이동·테이블 진입·실제 소켓 2인/4인 통합을 완료했다고 보고하지 않는다.

처리 후에는 기존 테이블에 가까이 이동 → E → 길목 한 수 선택 → 2인/4인 정원·판돈 확정 → 전원 준비 → 방장 시작 → 이동/장벽 → 도착 또는 기권 → 결과/정산 → 공원 복귀를 확인한다. 두 계정은 별도 브라우저 프로필이나 일반/시크릿 창으로 구분한다. 기권 잔해는 2인 명시적 기권에서 확인한다. 다른 작업의 서버·세션은 중지하지 않는다.

## 독립 검증

- BE: `QuoridorBoardTests`, `QuoridorMatchTests`, `QuoridorEngineTests`, `QuoridorCommittedStartTests`, `QuoridorFinishTests`.
- 공통 BE 회귀: 시작 계약/흐름, 개발 시작 흐름, 종료 저장·정산 listener 포함 63개 통과. 이후 변경한 전적·잔해 관련 회귀를 포함한 마지막 BE 실행도 37개 통과했다.
- FE: 길목 한 수·기권·공통 상태/결과·태블릿·효과음·설명서·전적·기권 연출·잔해 11개 파일, 204개 테스트 통과.
- 마지막 결과 복귀·테이블 표기 변경 후 관련 기존 FE 5개 파일, 64개 테스트도 통과했다.
- `tsc --noEmit` 통과. 임시 시각 QA 파일은 제거한다.
- `vite build --mode park-integration --outDir dist-quoridor` 통과. 맵 생성 pre-script는 실행하지 않았고 맵 원본·버전 변경도 없었다. 기존 Three CJS 사용 중단 예고 및 큰 chunk 경고는 남아 있다.
- 브라우저: Browser plugin이 없어 설치된 Chrome을 Playwright로 사용한다. 공원 두 계정 시도는 맵 계약 불일치로 차단되었다. 게임 화면은 별도 메모리 fixture에서 이동·가로/세로 장벽·설명서·반응형 스크롤을 확인한다. fixture의 상태 변경은 실제 서버 판정 검증을 대신하지 않는다.
- 맵 전수 탐색과 자전거·킥보드 주행 테스트는 추가하거나 실행하지 않았다.

## 화면 기준과 검수 기록

사용자 사진의 나무 판·말·장벽 구도를 참고하고, 기존 한지 원본 `/art/tablet/hanji.webp`, 먹색 글자·녹색 버튼·이중 테두리를 재사용한다. 보드 타일·말·클릭 영역은 코드로 그리며 목재 표면은 Image Gen의 단일 walnut texture를 사용한다. 생성된 재질을 `frontend/src/game/quoridor/assets/walnut.webp`로 저장했다. 게임 선택에는 새 브랜드 없는 목재 보드 썸네일을 사용한다.

Image Gen 기본 도구 사용. 컨셉 프롬프트는 전체 4인 게임 화면, 9×9 나무 보드, 네 참가자, 한지·짙은 녹색·금색 UI, 이동·장벽·방향·확정·채팅을 지정했다. 재질 프롬프트는 글자·보드·말 없는 평면 walnut wood surface다. 컨셉과 QA 이미지는 저장소 밖 `OnTop/output/quoridor-20261121`에 보관한다.

컨셉(1487×1058)과 실제 브라우저 PNG를 `view_image`로 비교했다. 비교 항목은 ① 9×9 판과 좌우 배치 ② 제목/차례 위계 ③ 한지·녹색·금색 팔레트 ④ 나무 재질과 네 말 구분 ⑤ 조작 버튼/장벽 미리보기 ⑥ 작은 화면 스크롤이다. 런타임 닉네임·목표 방향·합법 수·서버 상태 문구는 정적 컨셉의 예시 문구 대신 실제 계약을 따른다. 장벽 확정 버튼은 장벽 모드에만 표시하고, 채팅은 참가자도 사용하므로 '경기 채팅'으로 표기한다. 위젯의 읽기 영역에 불투명한 한지 바탕을 추가해 장식과 글자가 겹치지 않게 했다. 인접한 두 칸 길이 장벽의 클릭 영역 중첩은 교차 홈 단위 hit area로 수정했다.

네이티브 컨셉 크기 1487×1058, 세로 390×844, 낮은 가로 800×450을 확인했다. 후자의 스크롤 영역 너비는 각각 client/scroll 378/378, 780/780으로 가로 넘침이 없었다. 세로 스크롤로 마지막 채팅 전송 버튼에 접근할 수 있었고 scrollbar-width는 none이었다. fixture의 클릭 결과는 이동 `{kind:move,x:4,y:1}`, 가로 장벽 `{kind:wall,x:0,y:0,orientation:HORIZONTAL}`, 세로 장벽 `{kind:wall,x:2,y:2,orientation:VERTICAL}`였으며 설명서 열기도 확인했다. 마지막 화면의 page error 및 console error/warning은 없었다.

검수 화면은 실제 서버·계정·잔액이 연결된 공원 완료 화면이 아니다. 인프라 처리 후 통합 검증 결과를 이 문서에 추가해야 한다.
