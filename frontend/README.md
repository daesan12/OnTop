# OnTop frontend

React, TypeScript, Vite, React Three Fiber로 시작하는 테이블 화면이다. 현재 화면의 회전하는 상자와 안내 패널은 두 레이어의 배치·클릭을 검증하기 위한 임시 요소다.

## 실행

Node.js 24 LTS 계열과 pnpm 11을 사용한다. `.nvmrc`에는 팀 기준인 Node 24 계열을 명시했다. 가능하면 최신 패치 버전을 설치한다.

```sh
cd frontend
pnpm install
pnpm dev
```

브라우저에서 Vite가 표시한 주소를 연다. 확인 명령은 `pnpm typecheck`, `pnpm build`다.

## 컴포넌트 경계

- `src/App.tsx`: 같은 화면에 3D 장면과 UI를 함께 배치하고, 양쪽에서 필요한 상태·동작을 연결한다.
- `src/scene/SceneLayer.tsx`: React Three Fiber `Canvas`와 3D 콘텐츠. 3D 담당자가 실제 장면으로 교체한다.
- `src/ui/TableOverlay.tsx`: DOM 기반 테이블 UI. UI 담당자가 Figma 화면으로 교체한다.
- `src/styles.css`: 두 레이어의 크기와 겹침. UI 레이어의 빈 공간은 클릭을 3D 캔버스로 통과시키고, 패널·버튼은 클릭할 수 있다.

실제 게임 선택, 준비 상태, 참가자 정보는 백엔드 계약에 맞춰 이후 연결한다. 현재 클릭 횟수는 레이어가 각각 입력을 받는지 확인하는 로컬 데모 상태다.
