# M00 — 프론트 연결 계층과 이관 기반

2026-10-24. 이 커밋은 M00만 분리한 단계다. 최신 dev를 기준으로 기존 Spring 런타임을 추출하고 화면이 사용하는 내부 명령 인터페이스와 이관 경계 검사를 추가한다.

## 변경 범위

- `src/park/runtime/SpringParkRuntime.ts`: 기존 `runtime.ts`의 Spring HTTP/RawWS 구현을 옮겼다. 원래 클래스의 실행 로직과 요청/응답 처리는 유지한다.
- `contracts.ts`: 기존 공개 명령만 담는 FE 내부 `ParkRuntimePort`다. 서버 DTO/새 API를 정의하지 않는다.
- `runtime.ts`: 기존 import 경로·ParkRuntime 클래스·validateChat·ServerError·avatars를 재노출하며 하나의 실제 Spring 인스턴스를 구성한다. StrictMode 구독 횟수와 지연 해제 수명을 유지한다.
- `ParkRuntime.tsx`: 기존 컨텍스트가 구현 클래스 대신 FE 포트 타입을 사용한다.
- `scripts/check-migration-boundary.mjs`, package 스크립트: 소스/의존성/운영 빌드에 프로토타입 SDK·원본 편집 자산 의존성·제거한 가짜 입장 앱이 없는지 검사한다.

로그인/OAuth·세션 복원·온보딩 UI·서버 메시지·월드 표시·기존 테이블/오목 로직을 변경하지 않는다. 기존 dev 도메인 배치 연결도 기준 브랜치 것을 그대로 사용한다.

## 후속 단계와 분리

이 커밋에는 벤치/E 선택 확장, 이동 입력/보간 보정, 캐릭터/모션 보정, G 휠/감정표현, 운동기구, 망원경, 소리함, 각 기능 목업을 넣지 않았다. 다른 작업본의 인증/API 오류·지갑·미니게임·로컬 시연 작업도 포함하지 않는다.

백엔드·인프라·맵/버전·맵 생성 도구·Vite 설정·에셋·의존성 버전과 잠금파일은 수정하지 않는다. 프론트 빌드가 새 백엔드 도구를 요구하지 않는다. 별도 목업 로그인이나 프론트 전체 대체 런타임도 없다.

## 실행과 검증

```sh
pnpm install --frozen-lockfile
pnpm typecheck:tests
pnpm test
pnpm build
pnpm check:migration
pnpm exec playwright test tests/e2e/park.spec.ts tests/e2e/omok.spec.ts
```

기존 `pnpm dev`와 `dev:frontend-test`를 유지한다. 실제 입장은 기존 BE·OAuth 설정이 필요하며 로컬 API 프록시 기본 주소는 `http://127.0.0.1:8080`이다. `API_PROXY_TARGET`으로 기존 방식대로 바꿀 수 있다.

Browser plugin not available: 기존 Playwright/Edge와 저장소의 테스트 전용 HTTP/WS 계약 대역으로 기존 로그인·공원·오목·재접속을 회귀 검증한다. 실제 운영/개발 BE의 두 사용자 인증·방송·게임 성공을 대신하지 않으며 배포/BE 공동 검수 완료를 선언하지 않는다.

2026-10-24 M00 전용 작업본에서 다음을 확인했다.

- 잠금파일을 유지한 의존성 설치와 테스트 타입 검사 통과.
- 단위 테스트 9개 파일, 55개 테스트 통과.
- 운영 빌드와 `check:migration` 통과.
- Playwright/Edge 공원·오목 회귀 테스트 8개 통과. 기존 작업 서버와 분리한 `127.0.0.1:5198`에서 저장소 테스트를 실행했다.
- 기준 커밋 `69a9d19`의 기존 Spring 클래스 실행 본문과 구독/해제 수명을 추출 결과와 대조해 동일함을 확인했다.
- 원본 작업본의 변경 파일 144개의 SHA-256이 분리 전과 동일함을 확인했다.

기존 큰 3D 청크·Three.Clock/ANGLE 경고는 남아 있으며 자산/성능 검수는 후속 범위다.
