# 관전자 판돈 표시 — 작업 기록

- 작업 위치: `C:/Users/SSAFY/Desktop/OnTop/spectator-stakes-local-20261108`
- 최초 기준: `origin/dev@d404ad429472e0221cf6c2905e316604ec04a929`에서 만든 detached worktree. 기존 다른 작업 위치의 변경을 이관하거나 덮어쓰지 않았다.
- 원격 확인: `git fetch origin`은 삭제된 별도 브랜치 refspec 때문에 실패했다. 이어 `git fetch origin refs/heads/dev:refs/remotes/origin/dev`로 dev를 실제 갱신하고 해당 커밋을 작업 기준으로 사용했다. 다른 원격 브랜치 전체의 갱신 완료를 의미하지 않는다.
- 후속 사용자 승인으로 최신 `origin/dev@b55ead1616500c58e68b63e36c33835f9300c5bb`를 fast-forward 반영했다. 기존 수정 파일과 직접 겹치는 dev 변경이 없었으며 충돌 없이 실제 작업 기준이 갱신됐다.
- 작업 브랜치: `feat/S15P31B105-336-spectator-stakes`. Jira `S15P31B105-336`의 실제 제목은 `[FE] 게임 진행 화면 공통 판돈 HUD 추가`로 확인했다. GitLab의 열린 MR은 확인 당시 0개였다.
- 최초 로컬 전용 지시 이후 사용자가 최신 Git 확인·커밋·푸시·MR 생성을 명시적으로 승인했다. 이번 범위는 관전자 판돈 표시이며, 앞선 붕어빵·공중 이동·판 엎기 로컬 변경은 합치지 않았다. dev/master 머지와 브랜치 삭제는 보류한다.

## 구현과 연결 계약

- 기존 보드게임 7종의 공통 `GameHudMenu`에 관전자 전용 판돈 카드를 연결했다. 게임 진행 중 `SPECTATOR` 역할에서 총 판돈과 `1인 판돈 × 원래 참가 인원`을 표시하며, 경기 종료·관전 종료·참가자 역할에서는 숨긴다.
- 공통 변경: `GameHud.tsx`, `GameSpectatorStake.tsx`, `stake.ts`, `gameHud.css`. 오목 연결부 `OmokPanel.tsx`는 기존 ResizeObserver에서 실제 채팅 높이를 측정하여 작은 화면의 관전 도구와 판돈 카드가 채팅에 가려지지 않게 한다. 참가자용 기존 시계의 판돈 표시는 유지한다.
- 데이터는 같은 `gameId`의 `TABLE_STATE`/`TABLE_WATCH_STATE.betAmountPerPlayer`를 우선하고, 상세 상태가 아직 없으면 같은 경기의 공개 테이블 요약을 사용한다. 상세 상태의 미확인 금액을 요약 값으로 덮지 않는다.
- 총액은 확정 1인 판돈 × 게임 공개 상태의 원래 참가자 수다. 기권·탈락한 참가자의 판돈도 기존 총액 계산과 동일하게 포함한다. 다른 경기의 금액, 개인 잔액, 비공개 패, 정산 내역은 사용하지 않는다.
- 확인된 0은 `0냥`, 데이터 미수신·잘못된 값·안전 정수 범위 초과는 `확인 중`으로 표시한다. 서버·DB·migration 변경 없음.

## 로컬 실행과 검증

- 후속 커밋/MR 준비 시 최신 dev `b55ead16` 반영 후 아래 단위 44개·브라우저 5개·소스/테스트 타입 검사·프로덕션 빌드·diff 검사를 모두 다시 통과했다.

- 공원 맵: 최신 생성 맵 `c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`. `node scripts/generate-park-map.mjs`에서 추가 변경 0개.
- 프런트엔드에서 `node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5274 --strictPort`로 실행한다. 자동 테스트는 별도 임시 Playwright 설정으로 `metadata.generatedPark=true`와 동일 포트를 사용했다. 의존성은 기존 주 저장소의 node_modules를 로컬 junction으로 재사용했다.
- 단위 테스트: `gameStake`, `gameHud`, `gameSpectatorHud`, `gameSpectatorCount`, `publicGameWatch` 5개 파일, 44개 통과. 7종 게임의 공통 카드 표시와 참가자 전용 조작 비노출, 금액 계산·역할·종료·누락·0·다른 경기 구분 등을 확인했다.
- 새 브라우저 테스트: 오목·원카드 2개 통과. 1280×720, 960×540, 390×844에서 카드의 화면 내 배치, 가로 넘침, 다른 UI에 가려지지 않는지 확인했다. 큰 금액, 0, 미확인 경기 금액, 관전 상태 해제도 검증했다.
- 기존 브라우저 회귀 3개 통과: 오목 참가자 시계/판돈 배치, 경기 종료 시 숨김, 공개 관전 진입 → 판돈 확인 → 관전 종료. 새 테스트를 합쳐 총 5개 통과했다. 공개 관전 테스트가 사용하던 이전 시설 좌표와 초기 3D 준비 대기를 최신 생성 시설 카탈로그/준비 완료 조건으로 맞춘 후 통과했다.
- 타입 검사: 소스 및 테스트 TypeScript 검사 통과. 맵 생성·설명서 발행 후 프로덕션 Vite 빌드 통과. 기존 대형 chunk/Three.js 경고가 출력되었다.
- 변경 검사: `git diff --check` 통과.
- 브라우저 API/WS는 계약 fixture다. 실제 인증·백엔드·지갑 예약/정산·재접속 서버 연동은 이번 작업에서 검증하지 않았다. 단독 HUD 및 로컬 공원 연결 검증이며 실제 서버 통합 완료로 간주하지 않는다.
- 캡처: `C:/Users/SSAFY/.codex/visualizations/2026/11/07/01a1b66b-aeca-7cb1-bea4-f07a8f142223/spectator-stakes-{omok,onecard}-{1280,960,390}.png`.

## MR !451 피드백 검토

- `Game` 타입은 세부 게임 상태 하나를 필수로 갖지만, 런타임에 불완전한 관전 스냅샷이 들어왔을 때의 안전성을 보완했다. 상태가 없는 스냅샷을 주입한 단위 테스트에서 기존 `.status` 접근의 TypeError를 재현했으며, `gameState(game)?.status`로 변경 후 숨김 및 정상 상태 복귀를 검증했다. 정상 서버 흐름에서 부분 상태가 실제 발생했다는 의미는 아니다.
- 오목의 `measure`는 데스크톱과 모바일 모두 `omokSpectatorViewport.gameId`를 할당한다. 따라서 모바일이라는 이유만으로 기존 정리가 누락된다는 전제는 현재 코드와 다르다. 동일 경기의 측정값인지 확인하는 기존 조건을 유지하고 정리문을 여러 줄로 정돈했다.
- 390×844에서 처음부터 오목을 관전하고 종료하는 새 브라우저 테스트로 `--omok-chat-height`와 뷰포트 gameId가 모두 제거되는 것을 확인했다. 데스크톱 측정을 먼저 수행하지 않아 모바일 분기 자체를 검증한다.
- 최신 `origin/dev@b55ead16` 포함 확인 및 원격 작업 브랜치와 동일한 시작 SHA 확인 완료. 관련 단위 테스트 45개, 소스/테스트 타입 검사, 모바일 관전 종료 브라우저 테스트 1개 통과. 이전 판돈 UI/진입·종료 5개 브라우저 검증과 빌드는 앞선 커밋에서 통과했다.
