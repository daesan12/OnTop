# 겨울 공원 작업 기록 · 2026-11-19

## 기준과 작업 위치

- 브랜치: `feat/park-winter-theme`.
- 기준: 실제 fetch한 `origin/dev@8a6ace58e5eeb1ff2dd2d08d100cf4f3ff2d7055`. 재개 및 푸시 전 같은 기준인지 다시 확인한다.
- 기존 주 저장소와 다른 worktree의 미커밋 작업은 보존하고 `OnTop/park-winter-theme-20261119`에서 분리 작업했다.
- 삭제된 원격 브랜치가 fetch 설정에 남아 전체 fetch가 실패해 `git fetch origin +refs/heads/dev:refs/remotes/origin/dev`로 dev를 명시적으로 확인했다. 공유 Git 설정은 변경하지 않았다.
- 최신 dev가 이미 포함되어 추가 통합 커밋이나 충돌 해결은 없었다. Jira 번호는 제공받지 않아 임의로 만들지 않았다.

## 구현 범위

- 강설, 중앙 크리스마스 트리·선물·산타, 정문·중앙마당·호수 눈사람, 기존 건물 위쪽 면의 적설.
- 원본 건물·간판·텍스처를 보존하며 눈은 시각적 표면으로만 추가한다. 겨울 장식 배치와 고정 충돌을 동일 원본에서 생성한다.
- `Q`/화면 버튼의 공원 눈싸움. 인증된 서버가 출발점·발사 간격·현재 위치 명중·벽 차단을 판정하고 같은 채널에 공유한다. 상세 계약은 [world-winter-api.md](world-winter-api.md).
- 산타는 가까이 가면 인사하며 손을 흔드는 고정 NPC다. 퀘스트·보상·새 경기·새 gameCode·DB/Flyway 변경은 없다.
- 메인 석탑의 지나치게 넓은 기단 및 다음 층까지 채워진 몸통 충돌을 실제 단 높이·지붕 경사의 충돌체로 교체했다. 던지기 종료 시 캡슐이 층 모서리와 겹쳤다면 가까운 지지면으로 정리한다.
- 석탑 수정 커밋: `742dcf79` (`fix(park): 석탑 충돌면과 던지기 착지 끼임 수정`). 겨울 기능은 별도 커밋으로 분리한다.

## 공통 연결부

- FE: ParkPage·worldClient·runtime port, 기존 리뉴얼 장면·건물의 최소 연결. 겨울 전용 코드·CSS는 `frontend/src/features/winter/`.
- BE: 기존 TableProtocol·TableHub에 메시지 검증/연결, WorldChannelRegistry·WorldPhysics에 정적 차단 거리 조회. 판정은 `world/winter/SnowballService`에 둔다.
- 맵: `pagodaCollision.ts`, 기존 propCollision/live physics 및 생성된 `server-map.json`·manifest. 최종 맵 버전 `66b7173914e85976fdec036c1c16bc7e62e9021f6ff76357871994588ba43805`.
- CI/CD·Jenkins·배포·서버·네트워크 설정은 수정하지 않았다.

## 독립 검토

1. `frontend`에서 `node node_modules/vite/bin/vite.js --mode park-renewal-integration --host 127.0.0.1 --port 5300 --strictPort`.
2. `http://127.0.0.1:5300/park-renewal.html?winter=1`을 열면 중앙마당부터 확인한다. 드래그로 회전하고 휠로 확대하며 시설 목록에서 대석탑 등으로 이동한다.
3. 외관 미리보기는 로그인·서버 연결 없이 동작한다. 실제 이동/눈싸움은 인증된 `/park`와 동일 맵 BE가 필요하다.

## 검증

- FE typecheck 통과.
- `winter`, `carry`, `carryMovement`, `carryInputOwnership`, `carryEscape`, `avatarCarryMotion`: 6개 파일, 42개 테스트 통과.
- BE: `SnowballServiceTests` 3개, `PagodaThrowLandingTests` 10개, `WorldCarryFlowTests` 12개, `WorldCarryPhysicsTests` 38개, `RenewalLandmarkCollisionTests` 2개 통과. 이벤트 ID 최종 수정 후 관련 25개를 재확인했다.
- 석탑 검증은 하단·중간·상단의 정면/대각선 던지기 후 착지·퇴출 이동이며 맵 전수 탐색이 아니다. 자전거·킥보드 주행 테스트를 추가하거나 실행하지 않았다.
- Browser 플러그인이 없어 기존 Playwright + Chrome을 사용했다. 공원 UI는 실제 렌더러와 HTTP/WS 테스트 대역, 서버 통신은 별도 실제 로컬 WebSocket 테스트로 구분했다.
- 1440×900 / 390×844에서 겨울 장식·산타 인사·발사/명중 표시와 외관 미리보기·시설 선택을 확인했다. 외관 검토에서 초기 빈 화면을 발견해 겨울 프리뷰의 명시적 렌더 소유자를 추가하고 다시 확인했다.
- 리뉴얼 활성화 `park-integration` 프로덕션 빌드 통과. 기존 대형 청크 경고·Three CJS deprecation 경고가 남는다.
- `git diff --check` 통과.

## 원격 및 남은 범위

- 2026-11-19 사용자 후속 지시로 MR 생성·머지를 보류한다. 작업 브랜치를 삭제하지 않는다.
- 운영 환경의 실제 두 계정 브라우저 눈싸움과 헤드셋 실기 검수는 하지 않았다. 현재 결과를 운영 배포 완료로 표시하지 않는다.
- Jenkins 빌드 조회 연결/권한이 없어 빌드 성공은 확인하지 못했다. 로컬 빌드·서버 테스트 성공과 구분한다.

## 후속 변경 · 눈 줍기와 동결 (2026-11-19~20)

- 실제 fetch 후 최신 origin/dev `8a6ace58` 포함을 확인하고 기존 겨울 브랜치에서 이어갔다. 다른 worktree와 기존 변경은 보존했다. MR·머지 보류를 유지한다.
- 바닥 눈더미 네 곳을 지면 패치와 생성 맵 서버 검증 좌표로 함께 추가했다. 한 개를 주워 한 번 던지고 다시 줍는 방식이다.
- 3회 피격 시 5초간 동결, 기존 잡힘과 같은 A/D 교대 6회로 즉시 탈출한다. 서버가 동결 ID·중복·순서·간격을 검증한다. 자동 해제·피격 초기화·1.5초 보호·이탈/종료 정리를 포함한다.
- 전용 winterFrozen hold로 서버 이동·좌표 보고와 FE 이동 예측·입력을 함께 멈춘다. 소지 눈·얼음·카운트다운·탈출 진행·모바일 A/D 버튼을 표시한다.
- 공통 변경: TableProtocol/Hub, WorldChannelRegistry/Physics, PreparedParkMap, worldClient/runtime, input 및 carry 활동 판별. 새 게임 코드·정산·DB·Flyway·인프라 변경은 없다.
- 맵 버전: `0ab04be04ae71a2367c0a9affcc3cc9f229d3b105a1417adc420bbe0cdbd1e58`.
- FE 관련 43개 테스트·typecheck 통과. BE 관련 67개에서 새 실제 WS 테스트 2개의 배치를 실제 물리 warp로 맞춰 재검증했다. 눈더미 범위/소지량, 채널 격리, 물리 tick 정지, A/D 해제와 보행 복귀를 검사했다.
- Playwright/Chrome에서 줍기 → 소모 → 1·2·3회 피격 → 동결 → W 이동 차단 → 키 자동 반복 제외 → A/D 탈출 및 모바일 화면을 검증했다. 외관 프리뷰·시설 선택도 확인했다. 실제 운영 두 계정·헤드셋 검수는 별도다.
- 맵 전수 탐색·자전거/킥보드 주행 테스트는 추가/실행하지 않았다. Jenkins 조회 연결/권한은 없어 성공으로 표시하지 않는다. MR·머지·배포·브랜치 삭제는 진행하지 않는다.

## 실제 로컬 눈싸움 실행 (2026-11-20)

- 시작 시 fetch 후 origin/dev `8a6ace58`이 작업 이력에 포함된 것을 확인했다. 통합 충돌은 없었다.
- 기존 `StoneRumbleParkApplication`의 테스트 계정과 리뉴얼 실행 옵션을 재사용한다. 공원 이동·눈 줍기·피격·동결·탈출은 실제 서버이며 회원/지갑은 메모리 fixture다. DB와 외부 OAuth는 사용하지 않는다.
- BE: `STONE_RUMBLE_RENEWAL=true`, 테스트 클래스패스의 `com.ssafy.ontop.demo.StoneRumbleParkApplication`, `http://127.0.0.1:19191`.
- FE: frontend에서 `node node_modules/vite/bin/vite.js --config vite.stone-rumble-pagoda.config.ts --mode park-renewal-integration`, `http://127.0.0.1:5501/stone-rumble-park.html?role=1`. 두 번째 창은 `role=2`를 사용한다. 각 창은 channel-1에 자동 입장한다.
- 입구 정면의 흰 눈더미로 이동해 Q로 줍고, 상대를 바라본 뒤 Q로 던진다. 매번 다시 주워야 한다. 3회 피격 후 A/D 교대 6회 또는 5초 경과로 해제된다.
- Chrome 두 컨텍스트에서 실제 접속·맵 계약 verified·이동·줍기·소모·1/2/3회 피격·동결·키보드 A/D 6회 해제까지 확인했다. 실제 요청이 대기열에서 연달아 도착해 입력이 누락되던 현상은 이전 응답 후 40ms 간격을 두어 수정하고 재검증했다. FE typecheck 및 winter/carryEscape 9개 테스트를 통과했다.
- DB 없는 실행이므로 공지·당첨·알림·랭킹·뽑기·입장 소식 API는 503을 반환한다. 눈싸움 통신과 공원 실행은 정상이며 JavaScript 실행 오류는 없었다.
- 실행 PID/로그는 무시되는 `backend/.gradle/winter-playtest/`에 보관한다. 기존 서버는 중지하지 않았다. MR·머지 보류를 유지한다.
