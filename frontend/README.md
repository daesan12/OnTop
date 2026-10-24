# OnTop frontend

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

M09 공통 테이블 로비·방장/게임 선택·준비·관전 시점·결과/다음 판 흐름은 [MIGRATION_M09.md](docs/MIGRATION_M09.md)를 참고한다. 기존 Spring 테이블/경기 API를 유지하며, 아직 없는 공개 경기 ID 공급만 전용 개발 미리보기 포트로 분리한다. 새 경기 시작·정산·좌석 권한을 목업으로 대체하지 않는다.

M10 오목의 교차점 미리보기·마지막 수·승패/종료 안내와 기존 렌주·30초·착수/복구 연결 유지 범위는 [MIGRATION_M10.md](docs/MIGRATION_M10.md)를 참고한다. 미구현 수동 기권은 전용 개발 모드에서 의사 확인 UI만 목업으로 검수하며 실제 경기를 종료하지 않는다.

M11 주사위 한 판의 컵 조작·R 굴림·선택/재굴림·Q Bank·T 점수표·관전·30초·결과 연결은 [MIGRATION_M11.md](docs/MIGRATION_M11.md)를 참고한다. 기존 DICE API를 사용하며 주사위 난수·확정 점수·승패를 FE에서 만들지 않는다. 미구현 수동 기권과 공개 경기 참조 공급만 기존 전용 미리보기 경계로 유지한다.

M12 원카드의 본인 손패·공개 판·제출/뽑기·공격 수락·무늬 선택·선언/신고·복구·결과 연결은 [MIGRATION_M12.md](docs/MIGRATION_M12.md)를 참고한다. 기존 ONE_CARD API와 서버의 playableCardIds를 사용하며 타인의 패·덱 순서·로컬 게임 엔진을 추가하지 않는다. 미구현 수동 기권과 공개 경기 참조 공급만 기존 미리보기 포트로 분리한다.

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

- `src/login/LoginPage.tsx`: 네이버, SSAFY, 게스트 진입 버튼을 렌더링한다. SSAFY 버튼은 인증 시작 API로 이동한다. 네이버와 게스트는 후속 연결 안내를 표시한다.
- `src/auth/`: SSAFY 콜백의 일회용 교환 코드를 주소에서 즉시 제거하고 인증 교환 API를 호출한다. 교환 결과는 현재 탭의 메모리에만 보관한다. 광장 화면과 최초 프로필 설정 화면으로의 이동은 다음 작업 범위다.
- `src/styles.css`: 제공받은 배경/패널 이미지에 UI를 배치하고 BusanDandiMyeongjo 웹폰트만 적용한다.
- `src/assets/`: 프로젝트에서 제공받은 이미지 두 개와 BusanDandiMyeongjo 폰트 파일을 보관한다.

3D 장면은 로그인 화면에 표시하지 않는다. 추후 광장/테이블 화면에서 React Three Fiber 장면과 DOM UI를 함께 배치한다.

## 로컬 SSAFY 로그인 연결

Vite는 `/api/v1` 요청을 기본적으로 `http://127.0.0.1:8080`에 전달한다. 다른 주소의 백엔드를 사용할 경우 `API_PROXY_TARGET` 환경변수로 지정한다. 브라우저의 로그인은 `localhost` 호스트에서 시작해야 한다. 개발 서버를 `127.0.0.1`로 열었더라도 SSAFY 버튼은 `localhost`로 이동한다. 백엔드의 OAuth 세션 쿠키는 호스트별로 분리되기 때문이다.

백엔드에서 `local,db` 프로필과 SSAFY Client ID/Secret, JWT 서명 키, DB 연결을 설정해야 한다. 추가로 `AUTH_FRONTEND_CALLBACK_URI`를 실제 Vite 주소의 `/auth/callback`로 설정하고, `AUTH_ALLOWED_ORIGINS`에 해당 프론트 origin을 포함해야 한다. 예를 들어 Vite 주소가 `http://localhost:5173`이라면 콜백은 `http://localhost:5173/auth/callback`이다. 이 값들은 백엔드 실행 환경에서 설정하며 저장소에 비밀값을 기록하지 않는다.

SSAFY 인증 성공 후 백엔드는 `#exchange_code=`가 붙은 프론트 콜백으로 이동한다. 프론트는 fragment를 제거한 뒤 같은 세션 쿠키로 `POST /api/v1/auth/exchange`를 한 번 호출한다. 결과가 `AUTHENTICATED`이면 Access Token, `ONBOARDING_REQUIRED`이면 온보딩 토큰을 메모리에 보관한다. 브라우저를 새로 고치면 메모리의 토큰은 사라진다. 세션 복원과 후속 화면 이동은 별도 작업이다.
