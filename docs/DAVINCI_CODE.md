# 흑백수사 개발·연결 기록

## 범위와 기준

- 브랜치: `feat/davinci-code`
- dev 기준: `2aecab6531b06ec3c919726baf41cf75e31a059c` (2026-11-21 원격 확인).
- 기존 미커밋 작업은 보존하고 별도 `OnTop/davinci-code-20261121` worktree에서 구현했다.
- 사용자가 기존 테이블 연결을 명시적으로 승인했다. 지형·시설 좌표·맵 생성물·맵 버전은 변경하지 않는다.
- FE: `frontend/src/game/davinci/`, BE: `backend/src/main/java/com/ssafy/ontop/game/davinci/`.
- 표시명은 **흑백수사**다. 화면·설명서·전적·오류·테스트 계정 표시를 변경했다. 기존 `DAVINCI_CODE` 저장/통신 식별자와 소스 경로는 호환을 위해 유지한다. 새 migration은 추가하지 않는다.
- `ParkSecretTiles.tsx`가 기존 공원 Canvas의 실제 테이블 위에 타일을 렌더링한다. `TableBoards` 확장점을 재사용하며 별도 게임 Canvas나 가상 공원 배경으로 전환하지 않는다. 조작 HUD만 투명한 가장자리 레이어로 표시한다.
- 시작 시 서버의 `openingStartedAt` 기준으로 중앙에서 3초간 섞고 1.2초간 각 자리로 나눈다. 연출 중 숫자 표시/조작을 잠그고, 늦은 접속이나 재마운트 때 이미 끝난 연출을 재생하지 않는다. 모션 감소 설정을 읽는다.

## 규칙과 온라인 동작

- `DAVINCI_CODE`, 2~4명. 검정·흰색 각각 0~11과 조커(-1), 총 26개.
- 2~3인은 4개, 4인은 3개. 숫자 오름차순, 같은 숫자는 검정 먼저.
- 준비 중 조커를 원하는 위치에 한 번 놓는다. 이후 기존 타일의 상대 순서는 바꾸지 않는다.
- 매 턴 한 개 뽑기 → 합법 위치에 놓기 → 상대 비공개 타일 추리. 뽑은 타일은 종류와 무관하게 같은 배치 단계를 거쳐 조커 여부가 단계명으로 드러나지 않는다.
- 정답이면 상대 타일을 공개하고 계속 추리하거나 멈춘다.
- 사용자 제공 규칙에 맞춰 첫 실패는 이번에 뽑은 타일, 추가 추리 실패는 본인이 선택한 비공개 타일을 공개한다. 중앙이 비면 뽑기를 생략하고 실패 시 기존 비공개 타일을 고른다.
- 모든 타일 공개 시 탈락, 마지막 생존자 승리. 서버가 판정한다.
- 온라인 방치 방지: 준비와 턴 전체에 각각 120초. 준비 만료는 현재 조커 배치를 확정한다. 턴 만료는 뽑은 타일(첫 추리 전) 또는 기존 비공개 타일 하나를 서버가 공개하고 차례를 넘긴다. 이 온라인 추가 규칙은 게임 방법에도 표시한다.

## 연결 계약

- 기존 테이블의 선택·준비·시작·인증 WebSocket을 사용한다. 판돈 예약 커밋 후 `CommittedGameStartService`가 엔진을 만든다.
- `GAME_ACTION_SEND.input.kind`: `place_joker`, `ready`, `draw`, `draw_random`, `place`, `guess`, `stop`, `reveal`.
- `draw`는 선택한 공급 패의 `tileId`를 받는다. `draw_random`은 서버의 `SecureRandom`으로 현재 공급 패 중 하나를 고르고 같은 뽑기 경로를 사용한다. 권한·차례·버전·중복 요청 검사와 공개/개인 상태 분리는 동일하다.
- `guess`: `targetUserId`, `tileId`, `value`(-1~11). `place`: `position`. `place_joker`: `tileId`, `position`.
- `publicState`: 단계, 참가자, 색/공개 여부/공개된 숫자, 공급 타일 ID/색, 남은 시간과 마지막 추리. 숨겨진 숫자와 덱 순서는 보내지 않는다. 초기 배치 중 상대의 정렬 전 순서도 보내지 않는다.
- `privateState`: 본인 ID/타일 숫자, 본인이 뽑은 타일, 합법 배치 위치, 아직 배치하지 않은 조커. 관전자는 빈 객체만 받는다.
- 숫자를 모르는 타일의 숫자 텍스처는 클라이언트에서도 만들지 않는다. 타일 UUID에는 숫자/색/덱 순서를 인코딩하지 않는다.
- 중복 `actionId`는 동일 결과를 돌려주고, 같은 ID의 다른 내용은 거절한다. `expectedVersion`, 참가 권한·차례를 서버에서 확인한다.
- 공개 결과 종료 사유: `LAST_PLAYER_STANDING`. 기존 `GameLifecycle` 및 공통 결과·예약·정산 경로를 재사용하고 엔진에서 잔액을 변경하지 않는다.
- 기존 관전 경기 채팅을 재사용한다. `DAVINCI_SPECTATOR_PING_SEND`는 공개 타일 ID/사용자 ID/기준 버전만 전송한다. 기존 관전 승인·빈도 제한·만료·경기 구분 정책을 사용한다.
- 진행 상태는 메모리다. 네트워크 재접속 조회는 지원하지만 서버 재시작 후 경기 전체 복원을 보장하지 않는다.
- `WORLD_STATE.tables[].secretTiles`는 선택적 `{gameId,state}` 공개 투영이다. 엔진이 개인 숫자와 준비 중 순서를 제거한 복사본만 250ms 간격으로 월드에 반영한다. 종료 시 제거하며 좌석·좌표·충돌 데이터는 수정하지 않는다. 보행자도 관전 구독 없이 같은 타일 배치를 보고, 공식 관전 채팅/핑은 기존 승인 경로를 따른다.

## DB와 활성화

- 사용자가 V183을 지정했다. 파일: `backend/src/main/resources/db/migration/V183__allow_davinci_code_game_sessions.sql`.
- 기존 CHECK의 모든 게임별 인원 조건을 보존하고 `DAVINCI_CODE` 2~4인만 추가한다. 적용된 기존 migration은 수정하지 않는다.
- 원격 브랜치 및 로컬 worktree 230곳 확인 범위에서 V183 점유는 없었다. 열린 MR 전체·팀 별도 예약·실제 DB 적용 이력은 확인하지 못했다.
- 실제 MySQL 적용은 인프라 담당자가 기존 절차로 처리해야 한다. CI/CD·Jenkins·배포·네트워크·환경 설정 파일은 변경하지 않는다.
- BE 활성화 속성: `ontop.games.davinci.enabled=true`. FE 배포 빌드 활성화: `VITE_DAVINCI_ENABLED=true`. 개발 모드에서는 선택 가능하다.
- 담당자 요청문은 채팅에 별도로 공유했다. 인프라 적용 승인이나 배포 승인을 의미하지 않는다.

## 실행과 검수

### 규칙 독립 검증

```powershell
cd backend
.\gradlew.bat test --tests '*DavinciEngineTests' --offline --console=plain
cd ../frontend
pnpm exec vitest run tests/unit/davinci.test.ts
pnpm typecheck
```

### 공원 통합 로컬 검수

기존 공원의 테스트 fixture 패턴을 재사용한다. 실제 인증 소켓·테이블·게임 엔진을 사용하고 테스트 계정/지갑/시작·정산 저장은 메모리 대역이다. 운영 DB와 외부 OAuth는 연결하지 않는다.

1. `backend`에서 `.\gradlew.bat aiLabClasspath --offline`로 테스트 클래스패스를 생성한다.
2. 생성된 `build/ai-lab/classpath.txt`를 Java `-cp`에 지정해 `com.ssafy.ontop.demo.DavinciParkApplication`을 실행한다. Windows 명령 길이 제한이 있으면 `build/` 아래 Java 인자 파일을 사용한다.
3. `frontend`에서 기존 명령을 사용한다.

```powershell
$env:API_PROXY_TARGET='http://127.0.0.1:19203'
pnpm exec vite --mode park-renewal-integration --host 127.0.0.1 --port 5523 --strictPort
```

- BE: `127.0.0.1:19203`, FE: `127.0.0.1:5523`.
- 계정 1: `/secret-tiles-park.html?role=1`, 계정 2: `?role=2`. 별도 탭에서 각자 교환 로그인하며 토큰은 URL에 남기지 않는다. 페이지의 인증 상태는 메모리에만 있다. 이전 로컬 URL도 호환된다.
- 추가 참가자: `?role=3`, `?role=4`, 관전자: `?role=viewer`.
- 최신 공원 입구에서 중앙광장 돌테이블로 이동 → E 착석 → 흑백수사 선택 → 인원·판돈 설정 → 전원 준비·시작. 섞기·분배 후 조커 배치를 마치고 준비한다. 테이블 타일을 직접 클릭하거나 가장자리의 타일 버튼을 이용한다.
- 내 뽑기 차례에 중앙의 실제 3D 패를 클릭하거나 `중앙 패 직접 고르기` 목록을 펼쳐 선택한다. `무작위 뽑기` 버튼 또는 R은 서버 무작위 선택이다. 채팅 입력·설명서·팝업·열린 게임 메뉴·IME·반복 입력 중에는 R을 처리하지 않는다.
- Enter로 기존 공통 경기 채팅을 열고 Z로 기록을 확인한다. 시간과 게임 메뉴는 공통 `GameHudClock`·`GameHudMenu`, 채팅은 기존 `ParkChat`을 사용한다. 게임별 채팅 UI는 제거했다.
- 이 검수 서버는 기존 맵의 생성물만 읽는다. 기존 다른 서버·포트·worktree를 변경하지 않는다.
- 허용된 FE 검증만 수행하며 맵 전수 탐색 및 자전거·킥보드 주행 테스트는 실행하지 않는다.

### 독립 화면 프리뷰

`http://127.0.0.1:5523/secret-tiles-preview.html`에서 2·3·4인 배치를 전환할 수 있다. 서버 미연결 배치 fixture다. 실제 제품 플레이는 공원 테이블을 사용한다.

`?view=tiles`는 검정/흰색 숫자·매화 조커·동일한 창살 뒷면 6개를 보는 에셋 검수 화면이다. 공원과 프리뷰 모두 같은 Three.js 모델을 사용한다. 원목 마감·기와 먹색·상아색·구름 문양으로 제작하고 숨겨진 숫자/조커의 앞면 문양은 만들지 않는다.

## 검증 결과 (2026-11-21)

### 숫자패·선택·공통 UI 개선 검수

- 기준 `origin/dev`는 `2aecab6531b06ec3c919726baf41cf75e31a059c`이며 작업 이력에 포함됨을 재확인했다. 시설 좌표·충돌·맵 생성물·맵 버전·인프라 파일과 기존 V183은 변경하지 않았다.
- BE 관련 92개(엔진 16, 시작 3, 월드 투영 1, 공통 프로토콜 72), FE 관련 90개 통과. 서버 무작위 선택의 공급 패 일치·한 장 제거·개인 상태·관전자 보호·중복 행동과 R 입력 소유권을 포함한다. TypeScript 검사도 통과했다.
- 최종 Vite 통합 모드 빌드 통과: 1,764모듈, 45.73초. 기존 Three.js CJS·대형 청크 경고가 남는다. 맵 전체 탐색·자전거/킥보드 테스트는 실행하지 않았다.
- 실제 공원 계정 101/202의 로그인·맵 계약 확인·이동·착석·시작을 검증했다. R과 무작위 버튼, 실제 3D 중앙 패 클릭, 펼침 목록 선택이 한 장씩 처리되고 선택한 ID와 일치함을 확인했다. 채팅 입력·게임 메뉴·설명서에서 R이 패를 뽑지 않았다.
- 공통 경기 채팅이 한 개만 표시되고 참가자/관전자 간 메시지와 타일 핑이 전달됐다. 관전자에게 비공개 숫자가 전달되지 않았다. 마지막 승리·정산·다음 판 준비·일어나기 이후 두 계정이 각각 2.7m/3.1m 이동했다.
- 1440×900, 390×844, 800×420 브라우저 화면을 확인했다. 모바일 채팅과 조작판의 겹침·가로 넘침이 없고 중첩 패 목록 끝까지 스크롤할 수 있다. 로컬 검수용 계정 배지는 경기 중 숨겨 공통 채팅을 가리지 않는다. 브라우저 예외는 없었다.
- Browser 플러그인이 제공되지 않아 기존 CLI Playwright와 전용 Chrome 검수 프로필을 사용했다. 스크립트·스크린샷·빌드 산출물은 저장소 밖 `OnTop/output/`에 둔다. BE 19203과 FE 5523은 사용자 검수를 위해 유지한다. 실제 게임 엔진/WS와 메모리 인증·지갑·정산 대역을 사용하며 운영 DB/OAuth·배포 검증은 아니다.

```powershell
# backend
.\gradlew.bat test --tests '*Davinci*Tests' --tests '*TableProtocolTests' --offline --console=plain
# frontend
pnpm exec vitest run tests/unit/davinci.test.ts tests/unit/davinciShortcuts.test.ts tests/unit/gameFlow.test.ts tests/unit/forfeit.test.ts tests/unit/chat.test.ts tests/unit/chatDisplay.test.ts tests/unit/diceChatClicks.test.ts tests/unit/chatTyping.test.ts tests/unit/gameHud.test.ts
pnpm exec tsc --noEmit
```

### 이전 통합·표시명 변경 검수

- 공원 통합 변경의 BE 관련 테스트 113개 통과: 흑백수사 규칙·4인 순차 탈락·공개/개인 상태·공원 공개 투영·중복/낡은 요청·재접속·관전·기권·타임아웃, 예약 후 생성, 공통 종료/대기실 전이와 기존 시작/프로토콜/월드 채널 회귀.
- FE 관련 테스트 144개 통과: 공개 월드 정보의 비밀값/개인 상태 차단, 섞기 시각, parser·관전 핑과 기존 gameFlow/gameHistory/gameReactions/tableGamePresentation/tableLobby/forfeit.
- TypeScript 검사와 Vite 통합 모드 빌드 통과(1,763모듈, 47.66초). 첫 빌드는 기존 공원 소품 SSR 읽기 응답 시간 초과 후 설정 변경 없이 재시도해 성공했다. 기존 대형 청크/Three.js CJS 경고가 남는다. 빌드는 저장소 밖 검수 산출물로 생성했으며 맵 생성 명령은 실행하지 않았다.
- 실제 브라우저: 계정 101/202가 같은 최신 공원 채널에서 이동·기존 테이블 착석·선택·준비·시작·조커 배치, 뽑기/배치/정답/추가 실패/첫 실패/승리·정산을 확인했다.
- 관전자 999의 숨은 숫자 미공개, 실제 채팅과 타일 핑 전달을 확인했다. 결과 후 다음 판 준비·자리에서 일어나기·공원 이동 복구를 두 계정에서 확인했다.
- 1440×900, 390×844, 800×420 화면과 설명서 스크롤/Escape를 확인했다. 별도 2·3·4인 배치 화면 및 4인 모바일 프리뷰에서 가로 잘림과 브라우저 예외가 없었다.
- 추가 실제 브라우저 검수: 공원 안 4인 시작·각 3개 분배·네 명의 차례 진행·승리/정산·공원 복귀. 공원의 물리 타일 클릭으로 뽑기와 상대 패 선택이 동작했다. 비착석/비관전 보행자 999도 같은 테이블의 실시간 타일을 봤으며 숨은 숫자는 전달되지 않았다. 게임 전용 Canvas가 없고 공원 Canvas를 계속 사용함을 확인했다.
- 390×844 및 800×420 조작/설명서 스크롤·Escape와 가로 잘림을 확인했다. 3인 실제 다인 경기, 실제 MySQL migration·운영 인증/지갑·배포·헤드셋과 서버 재시작 복원은 검증 범위에 포함하지 않는다.
- 실제 시작 연출을 브라우저 안에서 측정했다. 26개 타일을 50회 관측했고 좌표 배치 28개가 서로 달랐으며, 관측 구간 약 3.86초 후 분배가 완료됐다. 새 검수 URL 두 계정의 로그인·이동·착석·시작도 확인했다.
- 최종 표시명 확정 변경: 사용자 표시 문구를 모두 흑백수사로 통일했다. 이번 변경에서 BE 19개·FE 144개와 TypeScript 검사를 통과했다. 두 계정의 실제 공원 로그인·이동·선택·플레이 제목·게임 방법·전적 이름·종료/정산·공원 복귀를 확인했고, 390×844 화면에서 가로 잘림이나 브라우저 예외가 없었다. 게임 규칙·공원 타일·섞기 연출·저장/통신 식별자는 유지한다.

실행한 관련 테스트:

```powershell
# backend
.\gradlew.bat test --tests '*Davinci*Tests' --tests '*GameStartFlowTests' --tests '*TableProtocolTests' --tests '*WorldChannelRegistryTests' --offline --console=plain
# frontend
pnpm exec vitest run tests/unit/davinci.test.ts tests/unit/gameFlow.test.ts tests/unit/gameHistory.test.ts tests/unit/gameReactions.test.ts tests/unit/tableGamePresentation.test.ts tests/unit/tableLobby.test.ts tests/unit/forfeit.test.ts
pnpm exec tsc --noEmit
```

## 공통 파일 변경 범위

게임 코드·테이블 선택/아트/설명서, 공통 경기 parser/store·명령 포트, 게임 패널, 결과/정산 허용 코드, 기존 시작 서비스의 선택 분기, 전적 표시/필터, 공통 기권·연출의 신규 코드 인식과 기존 관전 이벤트 경로에 연결한다. 공용 WS·지갑·정산을 게임별로 복제하지 않는다.

공원 내 플레이 변경에서는 `TableBoards`, `CameraRig`, `ParkPage`, 월드 parser/store와 `WorldChannelRegistry.PublicTable`의 선택적 공개 투영만 확장했다. 게임 규칙은 게임 폴더에 유지하고 시설 위치·공통 충돌·생성 맵 파일은 변경하지 않았다.

## 원격 반영

MR·머지·배포는 사용자 명시 요청 전까지 보류한다. 테스트 결과·커밋/푸시·원격 충돌 확인·Jenkins 확인 범위는 작업 완료 시 이 기록과 채팅에 남긴다.
