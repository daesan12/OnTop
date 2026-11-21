# BANG 테이블 게임 작업 기록

- 작업 위치: `OnTop/bang-20261121`, 브랜치 `feat/bang-table`.
- 기준: `origin/dev` `2aecab6531b06ec3c919726baf41cf75e31a059c`. 기존 변경이 없는 별도 worktree 사용.
- 사용자 승인: 4~7인 테이블 좌석 표시·아바타 배치·게임 카메라 변경 포함. 공원 지형·시설 위치·생성 맵 원본은 수정하지 않는다.
- 게임 소유 경로: `backend/.../game/bang/`, `frontend/src/game/bang/`, `frontend/public/art/bang/`.
- 공통 연결: TableGame, 시작/복구/결과 인원 검증, 태블릿 선택, 공개/개인 상태 파서, GamePanel, runtime action.
- FE/BE 계약: `BANG`, 4~7명, 기존 `GAME_ACTION_SEND`. 공개 상태에 체력·인물·장비·손패 개수, 개인 상태에 본인 역할·손패·선택지·합법 행동. 관전 개인 상태는 빈 객체.
- 팀 승리는 정상 탈락자도 공유한다. 명시적 기권자는 공통 FORFEIT 정책을 따른다. 엔진은 지갑을 변경하지 않는다.
- 종료 사유: LAW_WINS, OUTLAWS_WIN, RENEGADE_WINS. 승리 자격을 가진 팀원이 전부 기권했다면 NO_ELIGIBLE_WINNERS로 무효 처리한다.
- 서버 상태는 메모리다. 재접속 복구와 서버 프로세스 재시작 복원은 다르며 후자는 보장하지 않는다.

## 현재 마이그레이션: V188 (2026-11-22)

- 사용자 지시로 미병합 신규 SQL의 번호를 V187에서 **V188**로 변경했다. 현재 파일은 `backend/src/main/resources/db/migration/V188__allow_bang_game_sessions.sql`이며 실행 DDL은 그대로다. `BANG` 4~7인 CHECK 허용 목적과 FE/BE 계약은 변경하지 않았다.
- 작업 브랜치는 `feat/bang-table`. 승인받은 최신 `origin/dev` `f3980669e3d6a5c02d2472188a69d149932fbf94`를 `bd23f3fe`로 충돌 없이 병합했다. dev의 공원 렌더/겨울 장식/주민 로딩 변경을 포함하며 인프라 파일은 변경하지 않았다.
- 최초 검색에서 체스의 V188을 확인하여 변경을 보류하고 사용자에게 알렸다. 사용자가 체스는 V189로 변경 중이라고 확인했고, 실제 체스 worktree에서 `V189__allow_chess_game_sessions.sql`을 확인했다. 생성 직전 등록된 로컬 worktree DB 경로 246곳에서 V188 파일이 없었다. 최종 확인에서 원격 `origin/feat/chess`도 V188 없이 V189로 변경되어 번호 충돌이 해소됐다. 다른 원격 이력에서는 체스 외 V188 파일을 찾지 못했다. 열린 MR/별도 팀 예약은 조회 불가이며 MR 직전에 점유 상태를 다시 확인한다.
- 기본 Flyway location은 `db/migration`; `dev & db & !prod & !production`에서는 `db/migration,db/minigame`이다. 실제 운영 환경변수 값과 공용 DB의 적용 이력은 조회하지 못했다. 이 작업의 기존 검수는 `!db` 메모리 fixture였고 Flyway/공용 DB 적용은 수행하지 않았다. 이미 적용된 DB에 대한 rename/repair/초기화는 수행하지 않는다.
- 통합 검증: FE 타입 검사 통과, 관련 FE 테스트 53개는 최초 실행에서 52개 통과/1개 5초 timeout 후 해당 파일 6개가 코드 변경 없이 단독 재실행에서 통과했다. BE 게임 규칙/시작/종료/공통 테이블 39개는 통과했다. 전체 db location의 SQL 74개 버전 중복 없음과 주석 제외 DDL 동일성을 확인했다. `processResources` 통과 후 빌드 리소스에도 V187 없이 V188만 포함된다. 맵 전수 탐색/자전거·킥보드 FE 주행 테스트는 실행하지 않았다. 이 번호 변경에서 실제 MySQL 8.4 신규/순차 적용과 최신 dev 공원에서의 브라우저 경기 흐름은 미검증이며 기존 DB 검증 제약은 유지한다.
- 직접 테스트 준비 요청이 없어 게임 브라우저/사용자 검수 세션을 새로 열지 않았다. MR/머지는 요청 전까지 보류하고 브랜치는 유지한다. Jenkins 조회 정보/권한은 확인하지 못했다.

## 최초 V187 사전 공유 기록 (현재 V188로 변경)

사용자가 V187을 지정했다. 신규 파일은 1개, `backend/src/main/resources/db/migration/V187__allow_bang_game_sessions.sql`이다. 기존 game_sessions 인원 CHECK를 보존하면서 BANG 4~7인을 추가한다. 기존 migration은 수정하지 않는다.

최신 dev, 가져온 모든 origin 작업 브랜치, 로컬 등록 worktree의 모든 `db/**/V187__*.sql`에서 중복을 찾지 못했다. GitLab 열린 MR API는 404여서 확인 불가. 팀의 별도 예약과 실제 DB 적용 현황도 확인 불가. 기본 location은 db/migration, dev+db는 db/migration 및 db/minigame이다. 운영 프로필/환경변수의 실제 값은 확인하지 않았다. 공용 DB 적용과 인프라 설정 변경은 수행하지 않는다.

## 규칙 근거

- 제작사 기본판 규칙: https://www.dvgiochi.com/giochi/bang/download/Bang_rules_ENG.pdf
- 제작사 80장 카드 문양/숫자 목록: https://bang.dvgiochi.com/cardslist.php?id=1
- 제작사 기본판 FAQ: https://www.dvgiochi.com/giochi/bang/download/Bang!_FAQ_ENG.pdf
- 카드게임 기본판만 구현한다. 사용자가 예시로 언급한 주사위 버전은 이 게임 규칙에 포함하지 않는다.

## 화면 기준

`concept.png`는 내장 Image Gen으로 생성한 전체 화면 기준이다. 호두나무 테이블 중앙의 덱·버린 더미, 테두리의 상대 공개 상태, 하단 내 역할·손패, 왼쪽 기록·채팅, 우측 행동을 유지한다. 배경은 짙은 호두나무/살룬 톤, 카드 바탕은 크림색, 주 버튼은 #123b2a, 강조는 #bf903d다. 명조 제목과 시스템 고딕 조작 문구를 사용한다. 실제 UI 문구는 HTML이며 이미지에 굽지 않는다. 카드 일러스트는 별도 생성 atlas를 사용한다. 실제 서버 상태에 따라 손패·역할·인원·시간은 달라진다.

3D 게임 테이블과 소품은 Three.js 메시로 구성하고 기존 호두나무 재질을 재사용한다. 카드 일러스트를 단순 도형으로 대체하지 않는다. 좁은 화면에서는 수평 손패 스크롤 및 세로 조작 영역을 사용한다. 스크롤바는 숨기고 실제 스크롤은 유지한다.

## 실행과 검수

FE는 같은 pnpm lockfile의 기존 설치를 재사용한다. `frontend`에서 다음 명령으로 실행한다. 포트는 다른 작업과 분리한 5267/19187이다. 기존 실행 설정 파일은 수정하지 않는다.

```powershell
$env:API_PROXY_TARGET='http://127.0.0.1:19187'
node node_modules/vite/bin/vite.js --mode park-renewal-integration --host 127.0.0.1 --port 5267 --strictPort
```

- 독립 UI: `http://127.0.0.1:5267/bang-preview.html?count=7`. 4~7인 화면 fixture이며 실제 규칙·통신·정산을 실행하지 않는다.
- 실제 공원: `http://127.0.0.1:5267/bang-park.html?account=101`와 `account=202`. 추가 참가 계정은 303/404, 관전 검수 계정은 808이다. 토큰은 메모리에만 저장하고 비밀번호·토큰을 URL에 넣지 않는다.
- 공원 남쪽 입구에서 중앙광장으로 이동해 2번 돌테이블 등에 앉고 BANG을 고른다. 4명 이상 참가·전원 준비 후 방장이 시작한다. 두 계정만으로는 시작하지 않는다.
- `BangParkApplication`은 기존 frontend-test 프로필을 사용하는 테스트 classpath 진입점이다. 로컬 인증과 0냥 게임의 예약·정산만 memory fixture로 대체한다. 공원 물리·테이블·WS·게임 엔진은 실제 애플리케이션 코드다. 운영 DB·회원·외부 OAuth·실제 지갑에는 연결하지 않는다.

`backend`에서 `./gradlew.bat test --tests 'com.ssafy.ontop.game.bang.*' aiLabClasspath --max-workers=1`로 컴파일한 뒤 `build/ai-lab/classpath.txt`의 classpath로 `com.ssafy.ontop.demo.BangParkApplication`을 실행한다. Windows classpath 길이 제한이 있어 Java argument file을 사용할 수 있다. 빌드 출력 및 절대 경로 argument file은 커밋하지 않는다.

최신 220m 맵 `frontend/generated/park-renewal`을 FE/BE 양쪽에서 사용한다. 맵 버전은 `bb13a432887f01ad46677d03810be2931b26c4c2df25b2b2130253615f833742`이며 server-map Git blob `b3dc05e1c6d997b680f9a397642cca85e0e6c633`이 origin/dev와 일치한다. 생성기를 실행하지 않고 기존 파일의 해시·입력 해시를 확인했다. 기존 맵 상세 geometry cache의 out-of-sync 경고는 별도 영역으로 남기며 재생성하지 않았다.

## 검증 기록

- BE: 규칙/엔진/시작/종료 및 공통 인원·관전 프로토콜·관전 정책·결과 persistence 테스트 합계 80개 통과. 4~7인 각 12 seed의 48경기를 서버 합법 행동만으로 종료시키는 테스트 포함.
- FE: BANG 공개/개인 파서, 7인 결과·좌석, 기존 기권·테이블, 설명서·런타임·카메라 복귀·효과음 테스트 합계 98개 통과. 타입 검사 통과.
- FE 빌드: 기존 Vite 명령으로 최신 공원 모드 빌드. 기존 large-chunk 및 Three.js deprecation 경고는 남아 있다.
- 브라우저: 실제 최신 공원에서 독립 계정 4명의 로그인·이동·같은 채널·테이블 참가·준비·시작 및 개인 상태 분리를 확인했다. 1536×1024, 390×844, 390×500 및 800×480에서 화면·스크롤을 확인했다. 7인 화면은 독립 UI fixture다.
- 최종 실제 서버 검수: 카드 선택/사용, 다른 계정의 경기 채팅 수신, 기권 확인, 새 관전 계정(808)의 개인 상태 null 및 위치 핑 전달을 확인했다. 4인 경기에서 한 명이 기권·퇴장한 뒤 관전자가 참가했다. 보안관 기권 후 공통 승패/기권 결과와 0냥 fixture 정산 표시, ‘다음 판 준비’ → 자리에서 일어나기 → 두 계정 공원 이동을 확인했다. 최종 두 계정 pageerror는 모두 0이었다.
- 복귀 시 공원 렌더 재개 조건을 실제 게임 오버레이 표시 조건과 맞췄고, 기존 돌탑 전용 추가 의자를 다시 생성하지 않도록 제외했다. 변경 후 타입 검사 및 관련 FE 37개 테스트가 다시 통과했다.
- 공통 맵 전수 탐색이나 자전거·킥보드 테스트는 추가/실행하지 않았다.
- 실제 MySQL 8.4 migration 신규/순차 적용, 실제 지갑 정산, 운영 외부 인증, 헤드셋 검수는 미확인이다. 프로세스 재시작 후 경기 복원은 구현 범위가 아니다.
- 기존 frontend-test 채널의 최대 인원이 4명이므로 5~7인 + 관전자 동시 공원 검수는 인프라 담당자에게 별도 격리 채널을 요청했다. 기존 설정은 바꾸지 않았다.
- GitLab 열린 MR API는 인증 없이 404였다. 저장된 Git 인증정보를 API로 전송하는 추가 조회는 자동 승인 검토에서 거절되어 실행하지 않았다. 팀의 별도 V187 예약은 확인 불가다.
- 사용자 요청 전까지 MR·머지는 보류하며, 작업 브랜치를 삭제하지 않는다.

## 디자인 대조

1. 중앙 호두나무 3D 테이블과 덱/버린 더미를 유지했다.
2. 생성 삽화를 쓴 크림색 손패와 HTML 카드 이름·문양·숫자를 유지했다.
3. 상대의 공개 상태를 테이블 가장자리에 배치하고 내 역할은 하단에 둔다.
4. 짙은 녹색 헤더/주 버튼과 황동·금색 테두리/총알을 사용한다.
5. 왼쪽 행동 기록·채팅과 오른쪽 카드 행동을 유지하고 좁은 화면에서는 스크롤로 접근한다.
6. 작은 화면에서 공통 채팅이 손패와 행동을 가리지 않도록 BANG 내부에 기존 경기 채팅 포트를 연결했다.

전자판에서는 탈락자가 버릴 카드의 세부 순서를 별도로 선택하지 않고 서버가 정해진 순서로 처리한다. 타이머 만료 시 자동 선택·피해 수락·초과 손패 버리기 정책을 사용한다.

## 공통 파일 변경 목록

BE 기준 경로는 `backend/src/main/java/com/ssafy/ontop/`이다.

- `game/domain/GameSession.java`
- `game/reconnect/GameRecoverySnapshot.java`
- `game/result/GameFinishedResultListener.java`, `game/result/GameResultView.java`
- `game/result/persistence/VerifiedGameFinish.java`
- `game/start/CommittedGameStartService.java`, `game/start/GameStartCommand.java`
- `table/domain/TableGame.java`, `table/dto/TableProtocol.java`, `table/service/TableHub.java`
- `world/service/WorldChannelRegistry.java`

FE 기준 경로는 `frontend/src/`이다.

- `audio/sfxEvents.ts`
- `features/manual/GameArt.tsx`, `ManualHost.tsx`, `catalog.ts`, `types.ts`
- `features/tableLobby/TabletLobby.tsx`, `gatheringModel.ts`, `model.ts`, `tabletModel.ts`
- `features/tables/TableFurniture.tsx`
- `game/GamePanel.tsx`, `forfeit.ts`, `presentation/defeat.ts`, `protocol.ts`, `store.ts`
- `network/protocol.ts`
- `park/ParkPage.tsx`, `park/runtime/SpringParkRuntime.ts`, `park/runtime/contracts.ts`

검수 서버는 사용자 로컬 확인을 위해 실행 상태로 유지한다. 검수에 사용한 headless 브라우저만 종료해 테스트 계정의 연결을 비웠다. 사용자가 두 공원 창을 열면 상단 채널 메뉴를 ‘연동 테스트 A’로 맞춰 같은 공원에서 만날 수 있다. 두 링크만으로는 게임 최소 인원 4명을 충족하지 않으므로 추가 창에서 account=303/404를 사용할 수 있다.

## Git와 운영 확인 범위

- 기능 커밋: `1eba8d3a`(BE/규칙/V187), `9e90b61e`(FE/아트/테이블 UI), `c1030505`(복귀 렌더/기존 의자 중복 방지/본인 핑).
- 마지막 수정 후 타입 검사·관련 37개 테스트 및 최신 공원 모드 최종 빌드를 다시 통과했다. 빌드 출력은 커밋하지 않는다.
- MR 생성·머지·브랜치 삭제는 수행하지 않는다. 연결된 Jenkins 도구나 저장소 문서에서 접근 가능한 Jenkins 주소를 찾지 못해 해당 브랜치의 Jenkins 실행/성공 여부는 확인 불가다. 로컬 Gradle/Vite 성공을 Jenkins 성공으로 대신 표시하지 않는다.
- 인프라 담당자에게 격리 MySQL 8.4의 V187 신규/순차 적용·시작/종료/정산·기존 게임 회귀, 별도 8명 이상 검수 채널을 채팅으로 요청했다. 인프라 파일·설정·운영 DB를 직접 수정하거나 적용하지 않았다.
