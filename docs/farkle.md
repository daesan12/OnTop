# 주사위 한 판 · DICE

## 현재 마이그레이션 기준 (2026-11-03 V144 재지정)

- 사용자가 꼬치왕 번호 조정 후 주사위에 V144 사용을 재지정했다. 활성 작업 위치는 `OnTop/farkle-v144-local`, 브랜치는 `feat/farkle-v144-local`, 기준은 최신 `origin/dev@6b9a42fa`이다.
- 현재 사용할 파일은 `backend/src/main/resources/db/migration/V144__allow_farkle_four_players.sql` 1개다. DICE만 2~4인으로 확장하며 SQL 제약 내용은 이전 초안과 같다. 현재 작업의 활성 DB 경로에는 주사위 V145를 포함하지 않는다.
- 생성 전 모든 원격 브랜치와 로컬 worktree의 DB 경로에서 V144 중복이 없는지 확인했다. 꼬치왕 파일은 V146으로 이동했고, 사용자 공유에 따라 V145는 팀원 사용 번호다. GitLab 열린 MR은 기존 주사위 !322 한 개이며 신규 V144가 없었다. 다른 팀원의 미공개 예약과 운영 DB 이력은 직접 확인하지 않았다.
- 이전 `OnTop/farkle-four-players-local`의 V145 소스와 적용된 검증 DB `ontop_game_test_story174_farkle4`는 과거 자료로 보존한다. 해당 DB를 새 V144 소스로 실행하지 않으며 이력 삭제·repair·초기화를 하지 않는다. 아래 V145 검증 기록은 당시 이력을 뜻한다.
- 새 검증 DB는 같은 주사위 전용 MySQL 8.4.13의 별도 스키마 `ontop_game_test_story174_farkle4_v144`다. 업그레이드 테스트도 별도 임시 스키마에서 V143→V144 순차 적용, checksum, 재실행을 검사한다.
- 최신 dev 반영 중 `VerifiedGameFinish.REASONS`의 한 충돌을 해결하며 오목 `AGREED_DRAW`와 주사위 `LAST_PLAYER_STANDING`을 모두 보존했다. 새 DB 파일 외 다른 게임의 migration과 실제 서버 DB는 변경하지 않는다.
- V144 지정 당시의 로컬 전용 조건은 사용자의 후속 커밋·푸시·MR 요청으로 해제되었다. 활성 검토 위치는 `OnTop/farkle-review-v144`이며, 기존 공유 브랜치 `feat/farkle-traditional-hud`의 이력을 보존해 MR !322에 누적한다. MR 머지와 브랜치 삭제는 별도 요청 전까지 진행하지 않는다. SQL 첫 주석의 원격 보류 문구는 초안 작성 당시 기록이며, 적용된 V144의 checksum을 보존하기 위해 SQL 원문은 수정하지 않았다.
- 검증: 최신 기준에서 BE 관련 회귀 105개와 오목 합의 무승부 계약 2개, MySQL 7개(V144 순차 적용 1개 + 2·3·4인 승리/기권 정산 6개), FE 단위 66개, 앱 타입 검사를 통과했다. `git diff --check`와 미해결 충돌 검사도 통과했다. 새 V144 스키마와 기존 V145 스키마의 이력을 각각 확인한 뒤 전용 컨테이너를 정지했다.
- 전체 테스트 코드 타입 검사(`tsconfig.tests.json`)는 최신 dev에서 가져온 변경 없는 `frontend/tests/park-integration/fitness-reward.spec.ts:17`의 `AudioNode.connect` 오버로드 타입 오류(TS2322)로 실패했다. 이번 migration 변경과 분리된 기존 오류로 기록하며 해당 파일을 수정하지 않았다. 이번 요청에서 브라우저 UI·실제 운영 서버 연결은 다시 검증하지 않았다.

## 원격 검토 준비 (2026-11-04 후속 요청)

- 최신 `origin/dev@6b9a42fa`를 기존 공유 브랜치에 자동 병합해 오목 합의 무승부·보상·최신 맵 변경을 보존했다. 이전 V144 로컬 worktree와 적용 DB는 그대로 유지한다.
- 전체 테스트 코드 타입 오류를 없애기 위해 운동 보상 테스트의 Web Audio 연결 감시 함수가 `AudioNode | AudioParam` 두 오버로드 인자를 받도록 한 줄 보완했다. 네이티브 연결 호출과 실제 제품 코드는 유지했다.
- 앱·전체 테스트 TypeScript, FE 단위 2,018개(6개 기존 skip), park-integration 빌드, BE 관련 107개를 재검증했다. 이전 단락의 타입 오류는 이 후속 보완으로 해결되었다.
- 최종 MySQL 7개도 통과했다. 브라우저는 주사위 2·3·4인 진행·관전·채팅·점수표·기권·설정·고정 시점과 운동 보상 18개 시나리오를 검증했다. 최초 17개 통과/허탕 1개 실패는 캡처 중 연출 종료와 기존 시간값 비교가 경합한 테스트 문제였다. 연출 종료 및 중복 snapshot의 version 수신을 기다린 뒤 재생이 시작되지 않는지 확인하도록 보완했고 허탕 2개를 재실행해 통과했다. 실제 게임 동작이나 연출 시간은 바꾸지 않았다.
- 일반 Vite 빌드와 park-integration 빌드, 최신 맵 `map:check`, 점프맵 export check, 설명서 발행의 일치를 확인했다. 기존 Three.js deprecation·shader 정밀도 및 큰 번들 경고는 유지한다.
- Jenkins는 현재 `ontop-dev` 배포 작업만 확인되며 MR 파이프라인은 별도로 연결되지 않았다. 기능 브랜치 로컬 검증 성공을 Jenkins 성공으로 표시하지 않는다. MR 머지·실서버 배포·브랜치 삭제는 진행하지 않는다.
- 결과 UI 비교에서 확인한 후속 개선점은 유지한다. 다음 판 WAITING 상태가 엔진 snapshot을 비우면 주사위·장부·다리의 최종 점수 표시가 사라지며, 관전자는 공통 종료 흐름에 따라 결과창 없이 공원으로 복귀한다. 이번 MR은 이 공통 결과 흐름을 재설계하지 않는다.
- 브라우저 검증은 최신 generated 맵의 `127.0.0.1:5202/park`와 HTTP/WS 계약 fixture로 수행한다. 실제 BE RawWS 다인 테스트 및 MySQL 예약·정산 검증과 구분하며, 실제 운영 계정 2·3·4인 동시 접속과 서버 재기동 복원은 별도 통합 검증이 필요하다.

수신 자료 `ontap-game-rules-without-gomoku-20261021.zip`의 `rules/03_farkle.md`와 2026-10-21 사용자 결정을 적용한다. 2~4인, 공정한6면체 주사위6개, 무작위 선공. 시작 전에 서버가 목표2000/4000/6000점(기본 권장4000)을 확정한다. Bank로 총점이 목표 이상이면 즉시 승리하며 상대 추가 차례는 없다.

## 태블릿 게임 선택

`frontend/src/features/tableLobby/model.ts`의 DICE를 이용 가능 게임으로 설정해 공사 중 배지와 선택 제한을 해제한다. 기존 태블릿 분류를 사용해 상단 이용 가능 목록(오목 → 원카드 → 주사위 장부 → 주사위 한 판 → 과일 땡)에 배치하며, 다른 공사 중 게임의 제한은 유지한다. 목표 점수 2000/4000/6000점·2~4인·판돈 확인·명시적 시작 계약을 재사용한다. 게임 에셋은 유지한다. 2~4인 확장은 아래 로컬 전용 계약을 따른다. 실제 배포 서버에는 기존 `GAME_FARKLE_ENABLED=true` 및 공통 시작/예약 Gateway 설정이 필요하며, FE 카드 노출만으로 운영 서버의 활성화를 보장하지 않는다.

작업 위치는 `OnTop/frontend-dice-scorebook`, 브랜치는 `feat/farkle-traditional-hud`, 기준은 `origin/dev@221c4d9a`이다. 최신 맵 검증은 `park-integration` 모드의 `127.0.0.1:5202/park`와 HTTP/WS 계약 fixture로 진행한다. 일반 개발 모드의 태블릿 회귀 실행은 `node node_modules/@playwright/test/cli.js test --config playwright.tablet-default.config.ts tablet-flow.spec.ts`이며 실서버 두 계정 검증과 구분한다.

## 입력

기존 GAME_ACTION_SEND payload `{gameId,actionId,expectedVersion,input}`을 사용한다.

```json
{"requestId":"dice-1","type":"GAME_ACTION_SEND","payload":{"gameId":"실제-주사위-경기-ID","actionId":"dice-roll-1","expectedVersion":0,"input":{"kind":"roll","selectedIds":[]}}}
```

| input | 조건 |
| --- | --- |
| `{"kind":"roll","selectedIds":[]}` | 새 차례 첫 굴림 |
| `{"kind":"roll","selectedIds":[0]}` | 0번이 득점할 때 선택을 보관하고 나머지 재굴림 |
| `{"kind":"bank","selectedIds":[0,1,2]}` | 선택 전체가 득점할 때 이번턴 누적+선택 점수를 총점에 저장 |

selectedIds는 중복 없는0~5 정수 배열. 첫 굴림 이후에는 현재 굴림의 득점 선택이 하나 이상 필요하다. held=true 주사위 재선택·눈/점수/승자 주입은 거절한다. 선택은 프론트 표시용이며 roll/bank 때 서버가 확정한다. 이전 굴림의 보관 주사위와 새 주사위를 합쳐 새 조합을 만들 수 없다.

## 상태

GAME_STATE.publicState이며 참가자·관전자 privateState는 모두 `{}`. 관전은 기존 채널·테이블 중심20m 검사를 거친다.

| 필드 | 설명 |
| --- | --- |
| gameCode/status | DICE, PLAYING/FINISHED |
| players/scores | 좌석순 계정 ID 문자열/저장 총점 배열 |
| targetScore/turnTimeLimitMs | 목표/30000 |
| turnUserId/turnDeadline | 현재 차례 ID/UTC 마감. 종료 시 null |
| turnScore | 이전 굴림에서 확정한 이번턴 누적. 아직 프론트에서 선택 중인 점수 미포함 |
| dice | `[{id:0,value:1,held:false},...]`. 새 차례 첫 굴림 전 [] |
| lastRoll | 마지막 확정 굴림 `{rollId, actorUserId, dice:[{id,value,held},...]}` 또는 null. actorUserId는 문자열, dice는 보관 눈을 포함한 6개 |
| stage | AWAITING_ROLL/SELECTING/FINISHED |
| rollId/round | 전체 굴림 횟수/차례 번호(1부터) |
| hotDice/lastEvent | 최근 굴림이 핫 다이스인지/START,ROLL,HOT_DICE,BANK,BUST,TURN_TIMEOUT,PLAYER_LEFT |
| winnerUserId/endReason/endedAt | 승자/TARGET_REACHED 또는 RECONNECT_EXPIRED/종료 시각 |

BUST·BANK 후 새 차례 상태를 즉시 보낸다. 프로토타입의 ROLLING/BUST 연출 대기 단계는 서버에 없으며 프론트는 rollId/lastEvent로 연출한다. 기존 TypeScript FarkleState의 직접 복사가 아니므로 이 서버 계약으로 변환한다.

2026-11-03: `lastRoll`은 참가자·관전자·재조회에 동일하게 제공하는 공개 데이터다. 매 실제 굴림에 교체되며 허탕의 `nextTurn`이 `dice`를 비워도 유지한다. 저장·턴 시간 만료·종료에는 null로 비운다. 중복 actionId는 새 난수나 결과를 생성하지 않는다. FE는 일치하는 gameId/rollId와 actorUserId의 확정 눈만 허탕 결과 단계에 표시하며, 복구 시 지난 굴림을 자동 재생하지 않는다. 이전 BE에서 필드가 생략되어도 FE는 기존 연출을 유지한다. DB·정산·30초 마감·입력 계약은 변경하지 않는다.

## 점수와 시간

| 조합 | 점수 |
| --- | --- |
| 1 하나/5 하나 | 100/50 |
| 같은 눈3개 | 1은1000, 그 외 눈×100 |
| 같은 눈4/5/6개 | 같은 눈3개 점수×2/4/8 |
| 12345/23456/123456 | 500/750/1500 |

선택 전체를 겹치지 않는 득점 조합으로 나눈 최대합을 적용한다. 세쌍 보너스·최소 저장점수 없음. 득점 조합이 하나도 없으면 BUST로 이번턴만 잃고 다음 참가자 차례가 된다. 6개를 모두 득점에 쓰면 이번턴 유지·6개 재굴림(HOT DICE). 저장 총점은 BUST로 줄지 않는다.

**한 차례 전체30초**. 재굴림·잘못된 입력·재접속으로 연장하지 않는다. 정각부터 만료이며 이번턴 점수만 잃고 차례를 넘긴다. 시간패로 경기를 종료하지 않는다. 지연된 타이머도 원래 마감 기준으로 경과한 차례를 반영한다. 재접속30초 유예 만료의 기권은 별도다.

사용자 최신 결정은 오목 이외 게임30초·만료 시 넘김이다. 차오차오 기존5초굴림/12초선언/7초판단 원문과 구분하며, 차오차오 구현 시 입력 단계별30초·굴림/선언 만료는 해당 차례 종료·판단 만료는 해당 판단 넘김으로 적용한다. 수신 원문을 변경하지 않는다.

## 서버 연결과 검증

local/dev 또는 운영 `prod,db`에서 `ontop.games.farkle.enabled=true`로 선택 활성화한다(기본 꺼짐, 운영과 local/dev 혼합 시 제외). dev/prod 환경변수는 `GAME_FARKLE_ENABLED=true`이며 실제 시작에는 [예약 Gateway 연결](committed-game-start.md#켜는-조건)도 필요하다. `FarkleEngine.create(gameId,tableId,List<Long> players,int targetScore)`는 실제 참가·예약 커밋을 확인한 서버 내부 호출 전용이다. 임의 생성 API는 없다. 오목과 함께 켜면 GameEngineRouter가 gameId로 분기하며 참가자/테이블의 중복 진행을 막는다.

FarkleGameFinished는 서버 승패 알림이며 정산 완료가 아니다. 실제 저장·정산 후 기존 GameResultGateway/GameResultCommitted를 연결한다. 엔진·중복 기록은 메모리이며 재시작·다중 서버 영속성·종료 알림 전달 보장은 제공하지 않는다.

backend에서 `.\gradlew.bat test --tests '*Farkle*'` 또는 flowTest로 점수표·전체 눈 조합·잘못된 선택·버스트·핫 다이스·즉시승리·동시 중복·30초 경계와 실제 Spring/Raw WS 관전·heartbeat 복귀·자동 넘김·오목 전환을 검증한다. 인증/참가 확정은 테스트 대역, 시간은 제어 시계이며 실제 로그인·차감·지급/DB·운영 적용 검증은 아니다.

## 참가자 화면 조작 (2026-11-03)

- 기권 확인창은 다른 보드게임과 같은 공통 paperPopup.css 및 /art/tablet/hanji.webp를 재사용한다. 한지·수묵 문양·이중 테두리·녹색 계속 플레이 버튼을 맞추고, 닫기·작은 화면 스크롤 및 기존 native dialog의 입력 차단을 유지한다. 주사위 전용 보완은 game/farkle/forfeit.css에 한정하며 공통 스타일·에셋은 수정하지 않는다.

- 플레이 화면의 Esc와 게임 설정의 기권은 같은 확인창을 연다. 기본 초점은 계속 플레이이며, 기권 확정을 눌러야 기존 runtime의 GAME_FORFEIT를 요청한다. 대기·응답 불명 시 기존 actionId/복구 경로를 재사용한다. 확인 중에도 서버의 턴 마감은 계속 흐른다.
- 점수표·설명서·채팅·설정의 닫기와 잡은 컵 취소가 Esc 기권 안내보다 우선한다. 확인창은 게임 입력을 막고 Tab 초점을 내부에 유지한다.
- 경기 중 주변 둘러보기 버튼 및 좌·우 드래그/Tab 시점 전환은 제공하지 않는다. 판 시점 고정은 상대 턴에도 판을 유지하는 기존 설정이다. Tab은 UI 초점 이동에 사용한다. 다른 게임·관전자 카메라는 유지한다.
- 구현: frontend/src/game/farkle/{FarkleForfeitDialog.tsx,forfeit.css,controls.ts,camera.ts,FarklePanel.tsx}. 공통 연결은 world/input.ts의 DICE 참가자 드래그 제한 및 world/CameraRig.tsx의 DICE 카메라 호출이다. 이번 조작 변경은 BE·DB 계약을 변경하지 않는다.
- 독립 검증: frontend에서 node node_modules/@playwright/test/cli.js test --config playwright.park.config.ts farkle-escape.spec.ts farkle-view.spec.ts farkle-settings.spec.ts farkle-feedback.spec.ts. 127.0.0.1:5202의 최신 generated 맵과 HTTP/WS 계약 fixture를 사용하며 실제 경기 서버 검증과 구분한다.

## 관전자 집중 화면 (2026-11-03)

- 참가자·관전자 상단바는 game/farkle/FarkleScoreboard.tsx와 farkleHud.css의 같은 규칙을 사용한다. 문양·좌우 인장·글꼴·점수·목표 및 진행 막대 UI를 공유하고, 참가자의 나/내 차례와 관전자의 실제 이름/차례 표기만 구분한다. 관전 중·턴 번호는 관전 정보 패널에 표시한다.

- DICE 관전자만 적용한다. 공개 판 보기는 기존 탑뷰 방향을 유지하며 game/farkle/camera.ts의 diceSpectatorCameraPose가 화면 비율과 점수판·관전 패널·공원 채팅의 공간을 고려해 확대한다. 주사위·테이블·컵·모래시계의 에셋과 크기는 변경하지 않는다.
- 상단에는 참가자별 저장 점수(scores), 현재 차례(turnUserId), 목표 점수, 턴 번호를 표시한다. 이번 턴 누적(turnScore)은 관전 정보 패널에 따로 표시하며 선택 중인 점수를 임의로 추산하지 않는다.
- game/farkle/FarkleSpectatorPanel.tsx 및 farkleSpectator.css에서 목재색·금색 HUD와 SVG 눈금을 사용한다. 좁거나 낮은 화면에서는 관전 정보를 기본으로 접고, 펼치면 모든 조작과 마지막 안내를 스크롤로 확인할 수 있다. 스크롤바는 숨기고 실제 스크롤은 유지한다.
- 공원 채팅의 크기·색감은 유지한다. DICE 관전 중 겹치는 공원 빠른 메뉴·이동 안내는 게임별 CSS로 숨기고, 관전 종료 시 복원한다. 공통 로비·채팅·관전 권한 및 종료 로직은 변경하지 않는다.
- 공통 수정은 world/CameraRig.tsx에서 DICE 관전자일 때 게임별 카메라 함수를 호출하는 분기다. 다른 게임과 DICE 참가자의 카메라·입력은 유지한다. BE·DB·Flyway·통신 계약 변경 없음.
- 독립 검증: frontend에서 node node_modules/@playwright/test/cli.js test --config playwright.park.config.ts farkle-spectator.spec.ts farkle-view.spec.ts. 127.0.0.1:5202, 최신 generated 맵, HTTP/WS 계약 fixture를 사용한다. 실제 서버 경기·재화 DB 통합 검증과 구분한다.

## 2~4인 확장 · 로컬 전용 (2026-11-03)

- 작업 위치: OnTop/farkle-four-players-local, 로컬 브랜치 feat/farkle-four-players-local, 기준 origin/dev@47925414. 기존 MR !322의 주사위 UI와 이전 로컬 초안을 보존해 최신 dev 위에 충돌 없이 적용했다. 사용자가 V145를 지정하면서 로컬 작업만 허용했으므로 커밋·푸시·MR 변경·머지를 보류한다.
- 태블릿은 2/3/4인을 선택한다. 먼저 할 사람은 전체 참가자 수 안에서 무작위이며, 이후 좌석순으로 순환한다. 점수·차례·목표·기권 상태는 참가자와 관전자가 같은 전통 상단바에서 확인한다. 2인 레이아웃은 유지하고 3~4인은 모든 좌석을 함께 표시한다.
- publicState.players와 scores는 좌석순 2~4개로 길이가 같다. 선택 필드 forfeitedUserIds(문자열 ID 배열, 기존 서버 생략 시 [])와 lastEvent=PLAYER_LEFT를 추가한다. 참가자 원본 명단·점수를 유지하며 기권자를 차례·승리 후보에서 제외한다. 기권자는 NOT_ACTIVE로 추가 입력을 거절하고 재접속은 ELIMINATED, 남은 참가자는 PLAYING이다.
- 3~4인 기권·접속 유예 만료는 남은 사람이 계속 진행한다. 현재 차례 기권만 차례와 30초 마감을 새로 시작하며 다른 사람의 기권으로 현재 차례 시간이 연장되지 않는다. 마지막 한 명이면 LAST_PLAYER_STANDING, 목표 저장점수 달성은 TARGET_REACHED로 즉시 끝난다. 기존 2인 기권 종료 사유는 유지한다.
- 공통 연결 변경: TableGame DICE 인원, CommittedGameStartService DICE 시작 검사, VerifiedGameFinish 종료 사유, FE tableLobby/model.ts·protocol.ts·forfeit.ts. 기존 지갑·예약·정산·공원 복귀를 재사용하며 에셋/맵 좌표/의존성은 수정하지 않는다.
- Flyway: backend/src/main/resources/db/migration/V145__allow_farkle_four_players.sql 1개. 기존 파일은 수정하지 않는다. V143 원격 플러스마이너스, V144 로컬 꼬치 점유 및 열린 MR/로컬 worktree를 확인하고 사용자가 지정한 V145를 재확인했다. 원격 미등록 팀 예약과 실제 운영 적용 이력은 확인 범위 밖이다.
- 독립 UI 실행: frontend에서 node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5202 --strictPort. 검증 진입은 tests/park-integration/farkle-multiplayer.spec.ts의 최신 맵 HTTP/WS 계약 fixture이다. 운영 서비스 연결·실제 계정의 다인 플레이와 구분한다.

### 로컬 검증 결과

- 앱/테스트 TypeScript와 park-integration 빌드, git diff --check 통과. 기존 Three.js/대용량 청크 경고는 유지된다.
- FE 관련 단위 66개, BE 주사위·기권·차례·예약·정산 관련 91개 통과.
- Playwright/Edge의 고유 5개 시나리오 통과: 기존 2인 HUD/관전, 신규 3인/4인 태블릿→시작→점수·입력 권한·점수표/채팅, 4인 관전자. 1920×1080, 1366×768, 390×844, 320×568, 844×390에서 접근성을 확인했다. Browser plugin not available에 따라 기존 Playwright 경로를 사용했다.
- 별도 MySQL 8.4.13 컨테이너 ontop-farkle-fourplayers-mysql-20261103(127.0.0.1:13387)에서 신규 마이그레이션/JPA 검증, V143까지 적용된 신규 격리 스키마에 V145 순차 적용·checksum·재실행, 실제 DB 2/3/4인 판돈 예약→엔진 활성화→기권/최후승자→공통 전달 큐→정산·원장·중복 정산 4개 시나리오 통과. 다른 게임의 실행 중인 DB는 건드리지 않았다.
- MySQL 재현은 주사위 전용 컨테이너를 시작하고 TEST_GAME_DB_URL=jdbc:mysql://127.0.0.1:13387/ontop_game_test_story174_farkle4?useSSL=false&allowPublicKeyRetrieval=true, TEST_GAME_DB_USERNAME=root, TEST_GAME_DB_PASSWORD=빈 값으로 backend/gradlew.bat mysqlTest --tests *FarkleMigrationMySqlTests --tests *GameSettlementMySqlTests.주사위_선택인원*을 실행한다. 이 접속 설정은 격리된 로컬 QA용이며 운영 설정이 아니다.
- 최종 fetch에서 origin/dev@47925414와 로컬 기준이 일치하고 충돌 없음. 기존 원격 주사위 브랜치는 41b847cf 그대로이며 이번 확장의 커밋·푸시·MR 수정·머지·브랜치 삭제는 하지 않았다. Jenkins는 원격 반영을 보류해 실행/확인하지 않았다. 운영 서버의 4계정 통합 플레이는 미확인이다.

### 태블릿 목표 점수 선택 스타일 (로컬 전용)

frontend/src/features/tableLobby/tablet.css의 .tablet-score 선택 컨트롤만 짙은 녹색·금색 이중 테두리·선명한 숫자/화살표로 정리했다. 기존 native select와 목표 2000/4000/6000점, 방장/요청 중 비활성 조건과 TABLE_CONFIGURE payload를 유지한다. 380px 이하에서 제목 줄바꿈을 방지한다. 최신 origin/dev@47925414 기준의 Playwright/Edge 계약 fixture에서 1920×1080·1366×768·390×844·320×568·844×390, 마우스/키보드 선택·스크롤·방장 변경 비활성·6000점 준비 요청 전달을 확인했다. Browser plugin not available로 기존 Playwright를 사용했다. 제품 코드 변경은 이 CSS에 한정하며 BE·V145·에셋은 추가 수정하지 않는다. 로컬 전용 조건을 유지해 커밋·푸시·MR 갱신·머지는 보류한다.

### 2·3·4인 전체 재검증 (2026-11-03)

이번 요청에서는 제품 코드와 V145를 추가 변경하지 않고 테스트·fixture만 보강했다. 최신 origin/dev@47925414 기준이며 기존 미커밋 변경을 보존했다.

| 인원 | 태블릿 선택/준비/시작 | 실제 WS 굴림/저장/목표승리 | 실제 WS 타이머/기권/재접속/관전 | 실제 MySQL 예약/종료/정산 | 결과/다음 판/퇴장 UI |
| --- | --- | --- | --- | --- | --- |
| 2인 | 통과 | 통과 | 통과 | 통과 | 통과 |
| 3인 | 통과 | 통과 | 통과 | 통과 | 통과 |
| 4인 | 통과 | 통과 | 통과 | 통과 | 통과 |

- FE 단위 66개, BE 관련 105개(실제 Raw WS 다인 6개 포함), MySQL 7개, 고유 브라우저 시나리오 9개와 앱/테스트 타입 검사 통과. 브라우저 중 최초 복귀 검사는 사용자의 다음 판 준비 클릭을 빠뜨려 수정 후 2·3·4인 모두 재통과했다. 메모리 JSON 숫자 노드와 전송 후 JSON의 내부 타입 차이도 wire 형식으로 비교하도록 테스트를 보완했다. 게임 결함을 수정한 내역은 없다.
- 실제 WS: SecureRandom 주사위를 사용해 각 인원별 목표 달성까지 진행하고 잘못된 차례 입력 거절, 중복 actionId, 모든 참가자·관전자의 동일 공개 상태, 빈 privateState, 재접속, 실제 scheduler의 30초 타이머와 기권을 확인했다. 인증과 경기 생성 진입은 기존 테스트 대역이며 운영 로그인/테이블 전체 흐름의 보장은 아니다. 테스트 인증 fixture에만 303/404 참가자를 추가했고 기존 만료·미지원 인증 회귀 8개도 통과했다.
- MySQL: 주사위 전용 8.4.13 컨테이너에서 2·3·4인마다 목표 승리와 기권 종료 양쪽을 검증했다. 예약 금액·승자 지급·기권/패배 판정·예약 해제·원장 합계·중복 정산을 확인했고, 별도 격리 스키마에서 V143→V145 순차 적용·체크섬·재실행도 통과했다. 검증 후 전용 컨테이너는 정지하고 자료를 보존했다.
- UI: Playwright/Edge, 최신 generated 맵 http://127.0.0.1:5202/park, HTTP/WS 계약 fixture. 1920×1080·1366×768·390×844·320×568·844×390에서 점수·차례·조작·족보/채팅을 검수했다. 2·3·4인 결과창도 작은 세로/낮은 가로 화면에서 다음 판 준비·자리에서 일어나기까지 스크롤과 클릭 접근을 확인했다. 오류 오버레이·관련 콘솔 오류 없음(기존 Three.js 경고 유지). Browser plugin not available로 기존 Playwright를 사용했다.
- 실행: frontend에서 node node_modules/@playwright/test/cli.js test --config playwright.park.config.ts farkle-multiplayer.spec.ts farkle-hud.spec.ts farkle-bust.spec.ts farkle-escape.spec.ts farkle-spectator.spec.ts. backend에서는 gradlew.bat test의 Farkle*Tests/인증·기권·예약·결과·정산 관련 선택 검사, 기존 격리 DB 환경으로 gradlew.bat mysqlTest --tests *FarkleMigrationMySqlTests --tests *GameSettlementMySqlTests.주사위_*를 실행했다.
- 운영 2·3·4계정의 전체 FE↔실제 BE 동시 접속과 Jenkins는 별도 미검증이다. 로컬 전용 조건을 유지해 커밋·푸시·MR 갱신·머지·브랜치 삭제는 하지 않았다.
