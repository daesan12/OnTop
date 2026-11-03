# 주사위 한 판 · DICE

수신 자료 `ontap-game-rules-without-gomoku-20261021.zip`의 `rules/03_farkle.md`와 2026-10-21 사용자 결정을 적용한다. 2인, 공정한6면체 주사위6개, 무작위 선공. 시작 전에 서버가 목표2000/4000/6000점(기본 권장4000)을 확정한다. Bank로 총점이 목표 이상이면 즉시 승리하며 상대 추가 차례는 없다.

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
| hotDice/lastEvent | 최근 굴림이 핫 다이스인지/START,ROLL,HOT_DICE,BANK,BUST,TURN_TIMEOUT |
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

선택 전체를 겹치지 않는 득점 조합으로 나눈 최대합을 적용한다. 세쌍 보너스·최소 저장점수 없음. 득점 조합이 하나도 없으면 BUST로 이번턴만 잃고 상대 차례가 된다. 6개를 모두 득점에 쓰면 이번턴 유지·6개 재굴림(HOT DICE). 저장 총점은 BUST로 줄지 않는다.

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

- DICE 관전자만 적용한다. 공개 판 보기는 기존 탑뷰 방향을 유지하며 game/farkle/camera.ts의 diceSpectatorCameraPose가 화면 비율과 점수판·관전 패널·공원 채팅의 공간을 고려해 확대한다. 주사위·테이블·컵·모래시계의 에셋과 크기는 변경하지 않는다.
- 상단에는 참가자별 저장 점수(scores), 현재 차례(turnUserId), 목표 점수, 턴 번호를 표시한다. 이번 턴 누적(turnScore)은 관전 정보 패널에 따로 표시하며 선택 중인 점수를 임의로 추산하지 않는다.
- game/farkle/FarkleSpectatorPanel.tsx 및 farkleSpectator.css에서 목재색·금색 HUD와 SVG 눈금을 사용한다. 좁거나 낮은 화면에서는 관전 정보를 기본으로 접고, 펼치면 모든 조작과 마지막 안내를 스크롤로 확인할 수 있다. 스크롤바는 숨기고 실제 스크롤은 유지한다.
- 공원 채팅의 크기·색감은 유지한다. DICE 관전 중 겹치는 공원 빠른 메뉴·이동 안내는 게임별 CSS로 숨기고, 관전 종료 시 복원한다. 공통 로비·채팅·관전 권한 및 종료 로직은 변경하지 않는다.
- 공통 수정은 world/CameraRig.tsx에서 DICE 관전자일 때 게임별 카메라 함수를 호출하는 분기다. 다른 게임과 DICE 참가자의 카메라·입력은 유지한다. BE·DB·Flyway·통신 계약 변경 없음.
- 독립 검증: frontend에서 node node_modules/@playwright/test/cli.js test --config playwright.park.config.ts farkle-spectator.spec.ts farkle-view.spec.ts. 127.0.0.1:5202, 최신 generated 맵, HTTP/WS 계약 fixture를 사용한다. 실제 서버 경기·재화 DB 통합 검증과 구분한다.
