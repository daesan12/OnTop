# OnTop frontend

일반 `pnpm dev`와 `pnpm build`에서 착석하면 태블릿 게임 선택·준비·시작 화면을 표시한다. 별도의 tablet 모드나 활성화 환경변수는 필요하지 않다. 기존 AUTO 서버 호환이 필요한 환경만 `VITE_TABLET_LOBBY=false`를 명시한다. 시설/붕어빵 에셋 미리보기는 기존 화면을 유지한다. 서버 계약과 전달 문구는 [태블릿 인계 문서](docs/TABLET_LOBBY_HANDOFF.md), 생성 아트는 [제작 기록](docs/TABLET_ART_PROMPTS.md)을 참고한다. `dev:tablet`/`build:tablet`은 기존 검수 주소·산출물의 호환 명령으로 유지한다.

실제 서버 접속 방법과 계정별 수동 시작·2분 제한시간·결과 승계 확인 순서는 [서버 검수 체크리스트](docs/TABLET_SERVER_CHECKLIST.md)를 따른다.

`pnpm test:e2e:tablet:default`는 별도 모드 없이 일반 개발 실행의 착석→태블릿→수동 시작을 검증한다. 기존 `pnpm test:e2e`의 AUTO 호환 시나리오는 명시적으로 `VITE_TABLET_LOBBY=false`인 별도 테스트 서버를 사용한다.

수동 기권은 일반 실행에서 4종 경기의 확인창 → 기존 공통 WS `GAME_FORFEIT {gameId, actionId}` → 승인 영수증·경기 상태 확인으로 연결한다. 본인 차례가 아니어도 요청할 수 있지만 관전자·미복구·종료·이미 탈락한 참가자는 새 기권을 보낼 수 없다. 기권 중/승인/반영 불명 상태는 게임 행동을 차단하며 최신 판 수신만으로 다시 활성화하지 않는다. 타임아웃·재접속에는 자동 재전송하지 않고 메모리에 보관한 동일 actionId를 사용자가 명시적으로 재확인한다. 계정/공원 퇴장 시 식별자를 지우고 다른 경기의 늦은 영수증·오류는 무시한다. 승인 자체로 승패·좌석·지갑·정산 완료를 만들지 않으며 3·4인 중도 기권과 다리 판정 대기도 서버 상태를 따른다. `facility-preview`의 기존 의사 확인 목업은 실제 기권을 전송하지 않는다. 계약은 [수동 기권 API](../docs/game-forfeit-api.md)를 따른다.

의자 근처에서 `E 테이블에 앉기` 또는 테이블/의자 클릭으로 바로 착석을 요청한다. 서버가 승인하면 중간 정보창 없이 목재 태블릿에서 게임·정원·판돈·준비 상태를 표시한다. 요청 중에는 자리를 확인한다는 안내만 표시하고 중복 입력과 이동을 차단한다. 만석·진행 중 거절은 안내 후 서 있는 상태를 유지한다. 2D 정보 패널은 `테이블 정보·관전`을 별도로 선택할 때만 연다. 시작 승인 뒤 기존 게임별 HUD로 연결하며 종료 시 한지 결과 팝업을 표시한다. AUTO 호환 환경의 기존 2D 준비 화면도 보존한다. 서버 명령·비공개 손패/주사위·현재 규칙·정산은 기존 Spring 계약을 유지한다. 이관 범위와 원본의 운영상 차이는 [원본 테이블 화면 이관](docs/PROTOTYPE_TABLE_UI.md)을 참고한다.

기권 응답보다 종료 상태가 먼저 도착해도 기존 함께 보는 결과 화면과 결과 상세에서 승인·반영 불명 상태 및 같은 요청 재확인을 계속 제공한다. 기권 확인만으로 정산 완료나 다음 판을 만들지 않는다.

따라가기는 일반 실행에서 기존 `WORLD_FOLLOW_CHECK/START/STOP/STATE`로 연결한다. 캐릭터 우클릭/이웃 메뉴에서 승인된 관계와 줄을 표시하며, 자동 이동 좌표는 기존 `WORLD_STATE`를 따른다. 수동 입력·거리 초과·활동 전환 해제도 서버 관계 상태로 반영하고, 응답 유실은 명령 자동 재전송 대신 CHECK로 확인한다. `WORLD_EMOTE_CANCELLED`는 현재 채널·사용자·재생 원본 ID가 일치할 때만 감정표현을 종료하며 쿨다운을 유지한다. `facility-preview`의 관계·줄 표시 미리보기는 실제 자동 이동이나 서버 좌표를 변경하지 않는다.

팔각정 벤치는 시설 점유 정보의 좌석을 사용하며 착석 카메라가 연결된 테이블 중앙을 향한다. 가까이 관전은 같은 팔각정의 테이블을 `TABLE_WATCH`로 구독한 뒤 최신 `TABLE_WATCH_STATE.gameId`로 `GAME_WATCH`를 요청한다. GET 목록의 gameId는 보존하지만 실제 구독 ID를 우선하며, 누락/null은 진행 경기 없음으로 취급하고 ID를 추정하지 않는다. 공개 ID가 null/새 ID로 바뀌면 이전 공개 판을 즉시 숨기고 `GAME_UNWATCH` 확인 후 새 경기 또는 다음 판 대기로 전환한다. 참가자/판 시점과 우클릭 둘러보기를 제공하고, 벤치에서 일어나면 두 구독을 정리한 뒤 기존 카메라 복원 흐름을 따른다. 관전은 참가 좌석·개인 손패·비공개 눈·게임 행동·정산 권한을 부여하지 않는다. 거절/타임아웃에는 같은 ID를 자동 재시도하지 않으며, 재연결 버튼은 기존 구독 정리를 확인한 뒤 다시 요청한다. 재접속 때 이전 관전은 자동 복원하지 않는다. 실제 dev 배포의 경기 Gateway·동일 채널·20m 위치 설정과 관전 권한은 기존 BE 계약을 따른다.

`/admin/feedback`는 로그인 확인 후 기존 `GET /api/v1/admin/feedback?limit=20&cursor=...`만 사용한다. 최신 조회·이전/다음 페이지·빈 목록·재조회·401 갱신·403 관리자 거절·404/503 미구성을 구분하며 조회 실패 시 이전 의견을 지운다. 의견을 일반 텍스트로 표시하고 브라우저 저장소·로그·월드 소켓에 저장/전송하지 않는다. 별도 비밀번호나 클라이언트 관리자 판정은 없다. BE가 관리자 ID와 기능/DB 설정을 준비해야 한다. 관리자 권한을 알려주는 계약이 없어 공원에 관리자 메뉴를 노출하지 않고 직접 주소로 접근한다.

채팅은 투명 배경에서 `Z`로 이번 접속의 최근 100개 기록을 펼치거나 접는다. 입력 종료 후 최근 6개를 20초 표시하고 2개로 축약한다. 이전 대화를 읽을 때 새 메시지가 와도 스크롤을 유지하며 말풍선은 승인된 메시지를 10초 표시한다. 원본 사전의 욕설 마스킹은 FE 전송/수신 표시에 적용한다. 최종 서버 필터·200자/거리/전송 간격 정책은 기존 BE 권한이며 클라이언트 필터만으로 서버 검열 완료를 뜻하지 않는다.

공원 접속 후 기존 `GET /api/v1/wallets/me`를 비동기로 조회한다. 미조회/조회 중/조회 실패/지갑 준비 필요를 금액과 구분해 표시하며 실제 0은 `0냥`이다. 재조회 실패 시 기존 잔액을 보존하고 마지막 확인 금액임을 안내하며 공원 입장을 막지 않는다. 잔액 옆 재조회는 GET만 수행하고 지갑 생성·지급을 하지 않는다. 늦은 첫 조회가 상점/붕어빵에서 갱신된 새 잔액을 덮지 않도록 하며 사용자 전환·퇴장 시 취소한다. 실제 지급은 BE 온보딩·정산 책임이며 FE의 테스트 잔액은 운영 지급을 의미하지 않는다.

공원 카메라: 산책 중 `V` 또는 오른쪽 아래 시점 버튼으로 1·3인칭을 전환한다. `Ctrl`을 단독으로 눌렀다 떼거나 마우스 룩 버튼을 눌러 마우스를 고정하며, `Ctrl`/`Esc`·패널·채팅·시설 이용·창 이탈 시 해제한다. E로 진입하는 모든 요소(벤치·운동기구·망원경·테이블·붕어빵·소리함·익명 메모) 사용 후 이용 전의 1·3인칭, 방향, 거리를 복원한다. 이용 전 마우스 고정이 켜져 있었다면 종료 후 재개하며, 창 이탈·직접 해제는 존중한다. 브라우저 재고정 거절은 안내하고 Ctrl로 다시 켜며 자동 재시도하지 않는다. 1인칭 휠 입력은 기존 3인칭 거리를 바꾸지 않는다.

PICKUS 광고 클릭은 이동 안내창을 열며, 사용자가 **광고 보러 가기**를 선택했을 때만 원본 인스타그램 주소를 새 탭으로 연다. 다른 광고의 링크나 노출/클릭 집계 API는 추가하지 않는다. 두 기능은 FE 개인 표시/조작이며 인증·서버 물리·시설/경기 계약을 변경하지 않는다.

M00 프론트 연결 계층 분리와 배포 경계 검사는 [MIGRATION_M00.md](docs/MIGRATION_M00.md)를 참고한다. 기존 로그인·Spring HTTP/WS·월드/경기 연결을 유지하며, 기능별 이관과 개발 목업은 후속 단계에서 분리한다.

M01 공통 E 선택·벤치와 개발 전용 벤치 목업의 연결 범위·검증은 [MIGRATION_M01.md](docs/MIGRATION_M01.md)를 참고한다.

M02 이동 입력·점프·수영 표시의 기존 BE 연결 유지와 분리 검증은 [MIGRATION_M02.md](docs/MIGRATION_M02.md)를 참고한다.

M03 기존 캐릭터 자산·기본 자세·LOD·자원 수명의 분리 검증은 [MIGRATION_M03.md](docs/MIGRATION_M03.md)를 참고한다.

M04 감정표현·G 휠의 기존 소켓 연결과 개발 전용 미연결 표현 목업은 [MIGRATION_M04.md](docs/MIGRATION_M04.md)를 참고한다.

팀 BE의 격리 로컬 테스트는 [LOCAL_BE_VERIFICATION.md](docs/LOCAL_BE_VERIFICATION.md)를 참고한다. FE는 pnpm dev:frontend-test로 실행하며 이 모드에서만 전달받은 테스트 테이블 ID를 적용한다.

공통 경기 흐름·오목 준비는 [OMOK_INTEGRATION.md](docs/OMOK_INTEGRATION.md), 기존 프로토타입의 기능별 반영/누락은 [PROTOTYPE_FEATURE_AUDIT.md](docs/PROTOTYPE_FEATURE_AUDIT.md)를 참고한다. 실제 BE 플레이 완료와 계약 대역 검증을 구분한다.

공원 3D·기존 HUD의 공통 WebSocket 연결, 실행/검증 방법과 남은 연동 사항은 [PARK_INTEGRATION.md](docs/PARK_INTEGRATION.md)를 참고한다. 기존 로그인·온보딩 UI와 공원 HUD 디자인을 유지한다. 이관 에셋의 실측 및 미완료 항목은 [ASSET_OPTIMIZATION_STATUS.md](docs/ASSET_OPTIMIZATION_STATUS.md)에 기록한다.

React, TypeScript, Vite, React Three Fiber 기반 프론트엔드다. 현재 첫 화면은 Figma `02-C 로그인 · 내가 고친거 · Desktop 1920`을 구현한 로그인 진입 UI다. 이전 회전 상자 및 클릭 횟수 검증 데모는 제거했다.

## M05 운동기구 이관

기존 로그인·BE 연결을 유지하고 11종/12대 운동기구 이용·표시를 분리했다. 미구현 이용 API는 `pnpm dev:facilities`에서만 현재 탭의 목업으로 검수하며 일반 개발/운영에서는 비활성화한다. 계약 경계와 검증은 [MIGRATION_M05.md](docs/MIGRATION_M05.md)를 따른다.

## M06 망원경 이관

기존 전망대 두 망원경의 E 이용·접안·확대·방향·반납과 시점 복원을 분리했다. 미구현 점유/방향 API는 `pnpm dev:facilities`에서만 현재 탭의 목업으로 검수하며 일반 개발/운영에서는 비활성화한다. 계약 경계와 검증은 [MIGRATION_M06.md](docs/MIGRATION_M06.md)를 따른다.

## 실행

M09 공통 테이블 로비·방장/게임 선택·준비·관전 시점·결과/다음 판 흐름은 [MIGRATION_M09.md](docs/MIGRATION_M09.md)를 참고한다. 일반 실행의 공개 경기 ID는 최신 테이블 구독으로 공급한다. 새 경기 시작·정산·좌석 권한을 목업으로 대체하지 않는다.

M10 오목의 교차점 미리보기·마지막 수·승패/종료 안내와 기존 렌주·30초·착수/복구 연결 유지 범위는 [MIGRATION_M10.md](docs/MIGRATION_M10.md)를 참고한다. 수동 기권은 위의 공통 GAME_FORFEIT 흐름으로 연결한다.

M11 주사위 한 판의 컵 조작·R 굴림·선택/재굴림·Q Bank·T 점수표·관전·30초·결과 연결은 [MIGRATION_M11.md](docs/MIGRATION_M11.md)를 참고한다. 기존 DICE API를 사용하며 주사위 난수·확정 점수·승패를 FE에서 만들지 않는다. 수동 기권과 공개 경기 참조는 위의 일반 서버 연결을 사용한다.

주사위 효과음·자동 참가자 카메라·관전 전용 HUD의 원본 이관은 [M11 시각 보완](docs/M11_VISUAL.md#2026-10-26-효과음카메라관전-hud)을 참고한다. 내 차례에는 원본 48° 판 시점으로 전환하며 상대 차례에는 착석 시점으로 돌아온다. 주변 둘러보기와 상대 차례에도 판 시점 고정을 선택할 수 있다.

M12 원카드의 본인 손패·공개 판·제출/뽑기·공격 수락·무늬 선택·선언/신고·복구·결과 연결은 [MIGRATION_M12.md](docs/MIGRATION_M12.md)를 참고한다. 기존 ONE_CARD API와 서버의 playableCardIds를 사용하며 타인의 패·덱 순서·로컬 게임 엔진을 추가하지 않는다. 수동 기권과 공개 경기 참조는 위의 일반 서버 연결을 사용한다.

M13 거짓말 다리의 본인 비밀 눈·선언·순차 믿기/다우트·30초·말 이동/낙하·골인/사용 완료 슬롯·공동 승리·복구 연결은 [MIGRATION_M13.md](docs/MIGRATION_M13.md)를 참고한다. 기존 LIAR_BRIDGE API를 사용하며 비밀 난수·규칙 판정·정산을 FE에서 만들지 않는다. 수동 기권과 공개 경기 참조는 위의 일반 서버 연결을 사용한다.

M14 붕어빵의 원본 6칸 철판·조작·60초 조리·결과·복귀와 실제 미니게임 REST/지갑 연결은 [MIGRATION_M14.md](docs/MIGRATION_M14.md)를 참고한다. 서버가 발급한 불 세기를 사용하고 점수·보상 확정은 BE에 맡긴다. API 실패 시 브라우저 정산으로 대체하지 않는다.

M08 전망대 익명 메모의 정상 E 진입·목록·작성·실패/재시도·재접속 처리는 [MIGRATION_M08.md](docs/MIGRATION_M08.md)를 참고한다. 미구현 조회·게시만 `dev:facilities`의 페이지 메모리 목업으로 분리하며 일반 환경에서는 서버 연결 준비 안내와 비활성 버튼을 표시한다.

M07 지상 소리함의 작성·검증·실패/재시도·재접속 시 원문 보존은 [MIGRATION_M07.md](docs/MIGRATION_M07.md)를 참고한다. 미구현 제출 API만 `pnpm dev:facilities`의 페이지 메모리 목업으로 검수하며, 일반 환경에서는 작성 UI와 서버 연결 준비 안내를 표시하고 전송을 비활성화한다.

Node.js 24 LTS 계열과 pnpm 11을 사용한다. `.nvmrc`에는 Node 24 계열을 명시했다.

```sh
cd frontend
pnpm install
pnpm dev
```

브라우저에서 Vite가 표시한 주소를 연다. 확인 명령은 `pnpm typecheck`, `pnpm build`다.

## 화면 범위

- `src/login/LoginPage.tsx`: 네이버·SSAFY 버튼은 각각 기존 `/api/v1/auth/naver/authorize`, `/api/v1/auth/ssafy/authorize`로 브라우저를 이동시킨다. 게스트는 BE 인증·월드 접속 명세가 없어 준비중으로 표시하고 진입을 비활성화한다.
- `src/auth/`: 공통 콜백의 일회용 교환 코드를 주소에서 즉시 제거하고 인증 교환 API를 호출한다. `AUTHENTICATED`는 공원으로, `ONBOARDING_REQUIRED`는 기존 최초 프로필 설정으로 이동한다. Access/온보딩 토큰은 현재 탭의 메모리에만 보관하고 새로고침 시 기존 HttpOnly Refresh 쿠키로 세션을 복원한다.
- `src/styles.css`: 제공받은 배경/패널 이미지에 UI를 배치하고 BusanDandiMyeongjo 웹폰트만 적용한다.
- `src/assets/`: 프로젝트에서 제공받은 이미지 두 개와 BusanDandiMyeongjo 폰트 파일을 보관한다.

3D 장면은 로그인 화면에 표시하지 않는다. 공원/테이블 화면에서 기존 React Three Fiber 장면과 DOM UI를 함께 사용한다.

## 로컬 소셜 로그인 연결

Vite는 `/api/v1` 요청을 기본적으로 `http://127.0.0.1:8080`에 전달한다. 다른 주소의 백엔드를 사용할 경우 `API_PROXY_TARGET` 환경변수로 지정한다. 브라우저의 로그인은 `localhost` 호스트에서 시작해야 한다. 개발 서버를 `127.0.0.1`로 열었더라도 두 소셜 버튼은 `localhost`로 이동한다. 백엔드의 OAuth 세션 쿠키는 호스트별로 분리되기 때문이다.

백엔드에서 `local,db` 프로필과 공급자별 Client ID/Secret, JWT 서명 키, DB 연결을 설정해야 한다. 네이버는 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REDIRECT_URI`를 기존 BE 설정으로 주입한다. 추가로 `AUTH_FRONTEND_CALLBACK_URI`를 실제 Vite 주소의 `/auth/callback`로 설정하고, `AUTH_ALLOWED_ORIGINS`에 해당 프론트 origin을 포함해야 한다. 예를 들어 Vite 주소가 `http://localhost:5173`이라면 프론트 콜백은 `http://localhost:5173/auth/callback`이다. 공급자 콜백 `/api/v1/auth/{provider}/callback`과 프론트 콜백을 구분한다. 이 값들은 백엔드 실행 환경에서 설정하며 저장소에 비밀값을 기록하지 않는다.

소셜 인증 성공 후 백엔드는 `#exchange_code=`가 붙은 공통 프론트 콜백으로 이동한다. 프론트는 fragment를 제거한 뒤 같은 세션 쿠키로 `POST /api/v1/auth/exchange`를 한 번 호출한다. 결과가 `AUTHENTICATED`이면 Access Token, `ONBOARDING_REQUIRED`이면 온보딩 토큰을 메모리에 보관한다. FE에서 공급자의 code/state·Client Secret을 만들거나 토큰을 저장소에 보관하지 않는다. 네이버 로그인 성공 여부는 실제 앱 설정·테스트 계정·공급자 왕복 검수와 구분한다.

게스트 로그인은 현재 BE `LoginProvider`·REST/WS 인증 계약에 없다. 임의 JWT·회원 위장·로컬 성공으로 입장시키지 않는다. 게스트 발급 API, 세션 수명/복구/종료, 닉네임·외형, 채널·채팅 등 허용 범위가 확정되면 후속 연결한다. 근거는 루트 README의 API 문서와 `docs/auth-authorize.md`, `docs/auth-exchange.md`, `docs/api/websocket.md`다.
