# 게임 화면 피드백 구현·검증 기록

- 작업 위치: `OnTop/game-visual-feedback`, 브랜치 `fix/game-visual-feedback-20261101`.
- 최초 기준: `origin/dev@6c4d96d6`. 통합 전 다시 fetch하여 `52c8784d983486cce7fc38fb953838ce2c801e96`까지 fast-forward했다. 오목 종료와 최신 태블릿 준비 화면 변경을 보존했으며, 이번 수정과 겹치는 파일은 없다. 기존 다른 worktree의 미커밋 파일은 수정하지 않았다.
- 최신 맵: `park`, schema 2, `c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`. 생성물 검사에서 18개 테이블·536개 이동 장애물 일치, 파일 갱신 없음. 맵 원본·배치·충돌·카메라 파일 변경 없음.

## 게임별 범위

- `src/game/onecard/`: 첫 서버 턴(version 0, turnCount 1)의 deadline에서 시작 시각을 구한다. 700ms 셔플 후 참가자 순서대로 7장씩 뒷면 카드를 배분한다. 배분 도착 순서에 따라 실제 아바타 손패와 본인 전용 DOM 손패를 표시한다. 뒤늦은 관전·재접속에서 이미 지난 배분은 재생하지 않는다. 감소된 동작 설정에서는 비행을 생략한다. 서버의 카드 순서·규칙·deadline은 변경하지 않는다.
- 상단 공개 카드 CSS 기울기와 3D 바닥 카드의 최종 회전을 제거했다. 본인 손패의 부채꼴 배치는 유지한다.
- `src/game/omok/`: 참가·관전 채팅을 260px(작은 화면 최대 280px)으로 줄이고 입력 안내를 짧게 정리했다. 채팅·화면 핑의 기존 경기 구분·권한·전송 간격은 유지한다.

## 공통 연결부와 계약

- `features/parkDebris/`: 판과 엽전 외에 오목 돌 5개, 원카드 뒷면 카드 14개, 파클 주사위 6개, 주사위 장부 주사위 5개, 다리 말 6개를 독립적으로 비행·청소할 수 있다. 카드 잔해에는 개인 손패 정보를 쓰지 않는다. 주사위는 기존 게임 에셋을 재사용한다.
- BE `world/service/ParkDebrisStore.java`: 기존 `WORLD_PARK_DEBRIS_STATE`의 parts에 `card-0..13`, `die-0..5`(장부는 0..4), `pawn-0..5`를 추가한다. 기존 `board`, `coin-0..11`, `stone-0..4`는 유지한다. 2인 경기 명시적 기권 발생 조건도 유지한다.
- 서버의 기존 15초 만료와 전체 상태 전파를 재사용한다. FE는 `occurredAt + 15000ms`에 숨기고 씬에서 제거하므로 서버 정리 패킷이 지연돼도 화면에 남지 않는다. 부분 청소·재접속으로 만료 시각을 연장하지 않는다. 인스턴스 GPU 자원도 제거 시 해제한다.
- `park/runtime/{contracts,SpringParkRuntime}.ts`, `features/tableLobby/tableInteraction.ts`: 진행·만석 테이블의 E/클릭은 공개 TABLE_WATCH에서 받은 gameId로 관전을 요청한다. 앉기·게임 참가 요청을 보내지 않는다. 관전 요청 때 테이블 패널을 닫는다.
- `features/tableLobby/TableLobby.tsx`: 팔각정 벤치에 앉아 있을 때 공개 테이블 패널을 표시하지 않는다. 기존 벤치의 가까이 관전·판/주변 보기·일어나기·관전 종료를 사용한다. 돌 테이블은 서 있는 아바타 상태로 관전한다.
- `features/interactions/ParkInteractionHint.tsx`: 같은 테이블의 상태가 바뀌면 안내 문구도 갱신한다.
- `park/park.css`, `features/parkMenus/hud.css`: 채팅 메시지 영역의 둥근 클리핑을 제거하고 경기 범위 배지 둥글기를 줄였다.
- 인증·공통 WS·지갑·정산·결과·게임 규칙과 DB는 변경하지 않는다. Flyway 파일 없음. 팀원 사용 번호 V133을 포함한 migration 번호를 생성·예약하지 않았다.
- 새 parts를 이전 FE는 해석하지 못하므로 FE/BE는 함께 배포해야 한다. 현재 FE는 기존 판·엽전만 있는 서버 snapshot도 계속 허용한다.

## 독립 실행·검증 방법

작업 위치의 `frontend/`에서 실행한다. Node 24와 lockfile에 맞는 기존 설치 의존성을 사용한다.

```powershell
node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5234 --strictPort
node node_modules/@playwright/test/cli.js test --config playwright.game-visual-feedback.config.ts
node node_modules/vitest/vitest.mjs run tests/unit/onecardOpening.test.ts tests/unit/parkDebris.test.ts tests/unit/onecard.test.ts tests/unit/onecardUx.test.ts tests/unit/onecardHeldHand.test.ts tests/unit/onecardMotion.test.ts tests/unit/benchInteraction.test.ts tests/unit/worldMapParity.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --project tsconfig.tests.json --noEmit
node scripts/generate-park-map.mjs --check
node node_modules/vite/bin/vite.js build --mode park-integration --outDir dist-park
```

브라우저 테스트는 포트 5235의 최신 맵과 기존 HTTP/WS fixture를 사용하여 로그인·공원 이동을 반복하지 않고 각 게임 상태를 검증한다. 1920×1080과 390×844에서 원카드 2/4인 셔플→배분→7장 도착, 카드 각도, 채팅 기록·입력, 돌 테이블 서서 관전·팔각정 앉아서 관전, 관전 종료를 확인한다. 원카드와 장부 기권 테스트는 별도 기물 수 및 15초 뒤 모든 잔해의 씬 제거를 확인한다. 스크린샷은 시스템 임시 폴더 `ontop-fe-qa/feedback-*`에 보관한다.

BE는 `backend/`에서 다음을 실행한다.

```powershell
.\gradlew.bat test --tests com.ssafy.ontop.world.ParkDebrisStoreTests --tests com.ssafy.ontop.table.WorldGameReactionTests --tests com.ssafy.ontop.table.WorldGameReactionFlowTests --tests com.ssafy.ontop.game.omok.OmokEngineTests --offline
```

## 검증 범위와 남은 통합

- FE 관련 단위 테스트 74개, 앱·테스트 타입 검사, 최신 맵 생성물 검사, 최신 맵 production bundle 빌드 통과.
- 잔해·기권 생성/전파/청소·15초 경계 및 최신 원격 오목 종료 회귀의 BE 테스트 31개 통과.
- 최신 맵의 독립·연결 브라우저 시나리오 6개 통과. 게임 시작→진행 표시→기권→결과/공원 장면과 관전 진입→채팅→종료를 검증했다.
- Browser 플러그인 미제공으로 기존 Playwright/Edge를 사용했다. 프레임워크 오류 오버레이·pageerror·console error 없음. Three.Clock deprecation 및 Edge shader 정밀도 경고는 기존 장면에서 발생한다.
- 브라우저는 실제 서버 대신 계약 fixture에 연결했다. BE 전파 테스트는 로컬 테스트 서버를 사용한다. 운영 서버·MySQL·실제 여러 사용자 브라우저 간 연동·정산·운영 재접속까지 검증한 것은 아니다.
- 사용자가 충돌 확인 후 커밋·푸시·MR·머지·성공 시 작업 브랜치 삭제를 승인했다. 최종 원격 반영 결과는 MR에서 확인한다. 운영 서버에서의 실제 사용자 통합 QA 완료와는 구분한다.
