# 다빈치 코드 개발·연결 기록

## 범위와 기준

- 브랜치: `feat/davinci-code`
- dev 기준: `2aecab6531b06ec3c919726baf41cf75e31a059c` (2026-11-21 원격 확인).
- 기존 미커밋 작업은 보존하고 별도 `OnTop/davinci-code-20261121` worktree에서 구현했다.
- 사용자가 기존 테이블 연결을 명시적으로 승인했다. 지형·시설 좌표·맵 생성물·맵 버전은 변경하지 않는다.
- FE: `frontend/src/game/davinci/`, BE: `backend/src/main/java/com/ssafy/ontop/game/davinci/`.
- 3D 타일·받침·게임판·배경은 Three.js/React Three Fiber의 코드 모델이다. 한지 원본, 먹색, 녹색 주 버튼과 금색 이중 테두리를 기존 UI에 맞췄다.

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
- `GAME_ACTION_SEND.input.kind`: `place_joker`, `ready`, `draw`, `place`, `guess`, `stop`, `reveal`.
- `guess`: `targetUserId`, `tileId`, `value`(-1~11). `place`: `position`. `place_joker`: `tileId`, `position`.
- `publicState`: 단계, 참가자, 색/공개 여부/공개된 숫자, 공급 타일 ID/색, 남은 시간과 마지막 추리. 숨겨진 숫자와 덱 순서는 보내지 않는다. 초기 배치 중 상대의 정렬 전 순서도 보내지 않는다.
- `privateState`: 본인 ID/타일 숫자, 본인이 뽑은 타일, 합법 배치 위치, 아직 배치하지 않은 조커. 관전자는 빈 객체만 받는다.
- 숫자를 모르는 타일의 숫자 텍스처는 클라이언트에서도 만들지 않는다. 타일 UUID에는 숫자/색/덱 순서를 인코딩하지 않는다.
- 중복 `actionId`는 동일 결과를 돌려주고, 같은 ID의 다른 내용은 거절한다. `expectedVersion`, 참가 권한·차례를 서버에서 확인한다.
- 공개 결과 종료 사유: `LAST_PLAYER_STANDING`. 기존 `GameLifecycle` 및 공통 결과·예약·정산 경로를 재사용하고 엔진에서 잔액을 변경하지 않는다.
- 기존 관전 경기 채팅을 재사용한다. `DAVINCI_SPECTATOR_PING_SEND`는 공개 타일 ID/사용자 ID/기준 버전만 전송한다. 기존 관전 승인·빈도 제한·만료·경기 구분 정책을 사용한다.
- 진행 상태는 메모리다. 네트워크 재접속 조회는 지원하지만 서버 재시작 후 경기 전체 복원을 보장하지 않는다.

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
- 계정 1: `/davinci-park.html?role=1`, 계정 2: `?role=2`. 별도 탭에서 각자 교환 로그인하며 토큰은 URL에 남기지 않는다. 페이지의 인증 상태는 메모리에만 있다.
- 추가 참가자: `?role=3`, `?role=4`, 관전자: `?role=viewer`.
- 최신 공원 입구에서 중앙광장 돌테이블로 이동 → 착석 → 다빈치 코드 선택 → 인원·판돈 설정 → 전원 준비·시작.
- 이 검수 서버는 기존 맵의 생성물만 읽는다. 기존 다른 서버·포트·worktree를 변경하지 않는다.
- 허용된 FE 검증만 수행하며 맵 전수 탐색 및 자전거·킥보드 주행 테스트는 실행하지 않는다.

### 독립 화면 프리뷰

`http://127.0.0.1:5523/davinci-preview.html`에서 2·3·4인 배치를 전환할 수 있다. 서버 미연결 화면 fixture이며 실제 규칙 판정과 다인 통신을 대신하지 않는다.

## 검증 결과 (2026-11-21)

- BE 관련 테스트 146개 통과: 다빈치 규칙·4인 순차 탈락·공개/개인 상태·중복/낡은 요청·재접속·관전·기권·타임아웃, 예약 후 생성, 공통 종료/대기실 전이, 기존 시작/프로토콜/결과 저장/전적 요청 회귀.
- FE 관련 테스트 142개 통과: 다빈치 parser·비밀값 차단·관전 핑과 기존 gameFlow/gameHistory/gameReactions/tableGamePresentation/tableLobby/forfeit.
- TypeScript 검사와 Vite 통합 모드 빌드 통과(1,760모듈, 1분 38초). 기존 대형 청크/Three.js CJS 경고가 남는다. 빌드는 저장소 밖 검수 산출물로 생성했으며 맵 생성 명령은 실행하지 않았다.
- 실제 브라우저: 계정 101/202가 같은 최신 공원 채널에서 이동·기존 테이블 착석·선택·준비·시작·조커 배치, 뽑기/배치/정답/추가 실패/첫 실패/승리·정산을 확인했다.
- 관전자 999의 숨은 숫자 미공개, 실제 채팅과 타일 핑 전달을 확인했다. 결과 후 다음 판 준비·자리에서 일어나기·공원 이동 복구를 두 계정에서 확인했다.
- 1440×900, 390×844, 800×420 화면과 설명서 스크롤/Escape를 확인했다. 별도 2·3·4인 배치 화면 및 4인 모바일 프리뷰에서 가로 잘림과 브라우저 예외가 없었다.
- 3·4인 실제 브라우저 다인 경기는 아직 검수하지 않았다. 4인 규칙은 BE 테스트, 2~4인 외관은 화면 프리뷰로 검증했다. 실제 MySQL migration·운영 인증/지갑·배포·헤드셋 검수와 서버 재시작 복원은 검증 범위에 포함하지 않는다.

실행한 관련 테스트:

```powershell
# backend
.\gradlew.bat test --tests '*Davinci*Tests' --tests '*GameStartFlowTests' --tests '*TableProtocolTests' --tests '*GameFinishPersistenceServiceTests' --tests '*GameHistoryRequestTests' --offline --console=plain
# frontend
pnpm exec vitest run tests/unit/davinci.test.ts tests/unit/gameFlow.test.ts tests/unit/gameHistory.test.ts tests/unit/gameReactions.test.ts tests/unit/tableGamePresentation.test.ts tests/unit/tableLobby.test.ts tests/unit/forfeit.test.ts
pnpm exec tsc --noEmit
```

## 공통 파일 변경 범위

게임 코드·테이블 선택/아트/설명서, 공통 경기 parser/store·명령 포트, 게임 패널, 결과/정산 허용 코드, 기존 시작 서비스의 선택 분기, 전적 표시/필터, 공통 기권·연출의 신규 코드 인식과 기존 관전 이벤트 경로에 연결한다. 공용 WS·지갑·정산을 게임별로 복제하지 않는다.

## 원격 반영

MR·머지·배포는 사용자 명시 요청 전까지 보류한다. 테스트 결과·커밋/푸시·원격 충돌 확인·Jenkins 확인 범위는 작업 완료 시 이 기록과 채팅에 남긴다.
