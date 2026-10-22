# OnTop frontend

공원 3D·기존 HUD의 공통 WebSocket 연결, 실행/검증 방법과 남은 연동 사항은 [PARK_INTEGRATION.md](docs/PARK_INTEGRATION.md)를 참고한다. 기존 로그인·온보딩 UI와 공원 HUD 디자인을 유지한다. 이관 에셋의 실측 및 미완료 항목은 [ASSET_OPTIMIZATION_STATUS.md](docs/ASSET_OPTIMIZATION_STATUS.md)에 기록한다.

React, TypeScript, Vite, React Three Fiber 기반 프론트엔드다. 현재 첫 화면은 Figma `02-C 로그인 · 내가 고친거 · Desktop 1920`을 구현한 로그인 진입 UI다. 이전 회전 상자 및 클릭 횟수 검증 데모는 제거했다.

## 실행

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
