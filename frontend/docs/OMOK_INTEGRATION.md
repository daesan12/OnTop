# 공통 경기 흐름 · 오목 FE 준비

2026-10-22. dev 01e38e0에서 시작해 최신93649cf를 반영한다. 이전 공원 FE 이관6889d57이 dev에 포함된 상태에서 작업한다. 변경은 frontend만이며 로그인·온보딩·기존 공원 HUD 디자인과 원본 프로토타입은 유지한다. 새 패키지/소켓/인증 경로를 추가하지 않는다. 최신 탈퇴/세션 종료의4401/4403 계약도 기존 처리와 일치함을 확인했다.

## 구현 범위

- 테이블의 선택 담당자가 오목 선택 → 본인 준비/취소 → 서버 시작 대기 → 실제 경기 복구 상태 → 오목 착수/종료 → 정산 대기/조회 → 서버 WAITING 후 재준비.
- 준비 완료만으로 FE가 경기·판돈·타이머를 만들지 않는다. simulation=true/CONFIRMED는 시연으로 표시하며 실제 오목으로 진입하지 않는다.
- 15×15 3D 판/인스턴스 돌과 키보드 사용 가능한 화면 판이 같은 placeOmok 함수를 호출한다. 3D 클릭은 카메라 전환 완료·드래그 아닌 클릭·같은 경기/버전의 누름-놓음에만 허용한다. 선의 넓은 raycast를 끄고 판 표면에서 좌표를 계산한다.
- 본인 차례에 탑뷰, 상대 차례에는 기존 착석 시점으로 복귀한다. 착석/원격 전신은 기존 공원 상태를 사용한다. 자리 정보 없이 복구된 경우 화면 판은 제공하지만 3D 위치를 임의로 만들지 않는다.
- 본인·차례·빈칸·마감·최신 버전·복구/시작/정산 상태로 입력을 잠근다. 렌주 금수·승패는 FE가 판정하지 않는다.
- GAME_ACTION_RESULT는 요청 확인이다. 돌/점수/종료는 GAME_STATE만 반영하며 확인된 버전의 판이 오기 전 재입력을 막는다. 불명/시간 초과에는 상태 확인을 안내하고 자동 재착수하지 않는다.
- 시작 revision, 판 version, 결과 version을 따로 비교한다. 연결/채널 초기화 때 게임 상태를 지우고 옛 연결/경기 응답은 넘기지 않는다. 오목 privateState는 빈 객체만 허용하고 알려진 공개 필드만 복사한다.
- RESULT PENDING/SETTLED와 내 확정 순증감만 표시한다. 이 값으로 HUD 지갑 잔액을 더하거나 보상을 지급하지 않는다. 실제 WAITING 전에는 다음 판을 임의로 열지 않는다.

## 파일과 연결 이유

| 파일 | 이유 |
|---|---|
| src/game/protocol.ts / store.ts | 기존 게임 계약 검증과 렌더러 없는 표시 상태·권한/버전 처리 |
| src/game/OmokPanel.tsx / game.css | 새 게임 영역 안에서 선택·준비·상태·화면 판·결과 표시 |
| src/game/OmokBoard.tsx / cameraState.ts | 단순 공유 형상/재질·인스턴싱 3D 판과 전환 중 클릭 방지 |
| src/park/runtime/runtime.ts | SharedSocket 하나에 게임 요청/수신 연결. 착석·퇴장·채널 이동과 경기 상태 충돌 방지 |
| src/network/worldClient.ts | 기존 연결/채널 정리 때 게임 표시 상태도 함께 비움 |
| src/park/ParkTools.tsx | 앞서 추가한 연결 패널 안에 게임 제어 배치. 팀원 ParkPage/park.css는 수정하지 않음 |
| src/features/tables/TableShell.tsx / src/world/CameraRig.tsx | 해당 서버 테이블의 오목판 표시와 본인 차례 카메라 연결 |
| tests/unit/gameFlow.test.ts / tests/e2e/omok*.spec.ts | 상태 검사, 계약 대역 브라우저 흐름, 별도 자산 비교 |

서버 문서: docs/omok.md, websocket-api/03-ready-set.md·07-game-select.md·09-game-communication.md, committed-game-start.md, game-reconnect.md, game-result-api.md. 모두 읽기 전용으로 사용한다.

GAME_SELECT(OMOK), READY_SET, GAME_START_CHECK, GAME_RECONNECT_CHECK, GAME_STATE_CHECK, GAME_ACTION_SEND, GAME_RESULT_CHECK와 해당 수신을 기존 /ws/tables에서 처리한다. 새 연결이나 임의 경기 생성 API는 없다.

## BE 없이 확인 / 실제 서버 확인

계약 대역은 테스트 안에서만 HTTP/WS를 가로챈다. 운영 앱에 테스트 계정·게임 생성·테스트 서버 선택 경로는 없다. Browser plugin not available이므로 Playwright/Edge를 사용한다.

실행 검사: pnpm typecheck, pnpm typecheck:tests, pnpm test, pnpm build, pnpm test:e2e.

브라우저 목표: 로그인 복원 → 공원·착석 → 오목 선택·준비 → 서버 STARTING → 실제 PLAYING/RESTORED 응답 → 금수 거절 후 재입력 → ACK만 받았을 때 미표시/입력 잠금 → 최신 판 → 3D 좌표 착수 → 복구 중 잠금 → 종료·정산 대기/완료 → 서버 WAITING. 모든 요청에서 소켓 최대 동시 수는 1이어야 한다.

검증 결과: 앱/테스트 타입 검사·production build, 단위8파일51개 통과. 기존 공원 기능6개와 오목 기능 흐름은 Edge 1920×1080 및1280×720에서 통과(묶음 회귀 이후 두 PC 화면의 오목 흐름을 별도 실행). 의미 있는 첫 화면/제목, Vite 오류 오버레이 없음, 오목 페이지·콘솔 error 없음, 3D 좌표/드래그, 기본 HUD 보존을 확인했다. 기존 Clock·셰이더 정밀도 및 큰 청크 경고는 남는다. 자산 전후 비교는 별도 두 실행으로 통과했으며 일반 기능 회귀에서는 두 자산 측정을 의도적으로 제외한다.

실제 서버 검증은 미수행이다. 다음을 확인해야 한다.

- 실행 서버·OAuth·DB, 채널/tableId→공원 위치 설정.
- 실제 게임 시작 Gateway/오목 엔진 활성화·참가 차감·GAME_CONNECTION_STATE 순서·복구 좌석과 3D 배치 복원.
- 두 실제 계정의 착수·렌주 거절·30초 시간패·통신 단절/만료·종료·DB 정산·다음 판.
- 서버 시각 동기화 계약이 없어 남은 시간은 브라우저 시계 기준의 참고 표시다. 서버가 최종 마감을 판정하며 시계가 어긋난 PC의 UX 검증이 남는다.
- 관전 프로토콜/공개 전용 상태·입력 차단은 준비했지만 공원 테이블에서 관전 gameId를 얻는 승인된 공개 연결 정보가 없어 일반 사용자용 관전 진입 버튼을 만들지 않았다. tableId를 gameId로 추정하지 않는다. 관전 3D 위치/카메라·거리 검증과 정식 진입 UI는 후속이다.
- 기권 명령·보상 계산·다른 보드게임·F1·시설 이용 기능은 이번 범위에 추가하지 않았다. PROTOTYPE_FEATURE_AUDIT.md 참고.

새 오목판 자산의 최적화 결과/미완료 게이트는 OMOK_ASSET_STATUS.md에 기록한다. 큰 WorldCanvas 청크·기존 Clock/셰이더 경고는 남는다. 실제 운영 플레이 완료나 특정 FPS를 보장하지 않는다.
