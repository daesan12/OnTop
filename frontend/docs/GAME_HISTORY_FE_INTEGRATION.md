# 전적 조회 FE 연동

## 새 맵 적용 (2026-10-30)

생성 공원이 포함된 `dev(18225121)`를 통합하고 새 맵 장면에서 전적 7개 브라우저 시나리오를 다시 통과했다. 기권/패배 분리·커서·인증/재시도와 기존 화면을 보존하고 새 점프맵 요청 허용 목록과 공존하도록 런타임 충돌을 해결했다. 실행은 `pnpm exec playwright test --config playwright.records-park.config.ts`이며 자세한 전체 검증과 실제 서버 확인 한계는 [PUBLIC_CHAIRS_FE_INTEGRATION.md](./PUBLIC_CHAIRS_FE_INTEGRATION.md)를 참고한다.

## 계약 확인

2026-10-29, `origin/dev`의 `fb6a307`에 머지된 `docs/game-history-api.md`, 응답 DTO, `GameHistoryHttpTests`를 읽어 아래 필드를 확인했다. BE 소스·DB·배포 설정은 수정하지 않았다.

- 경기 내역: `GET /api/v1/users/me/games?size=20`. 다음 요청은 같은 경로에 `&cursor=<nextCursor>`, 게임 필터는 `&gameCode=OMOK|DICE|ONE_CARD|LIAR_BRIDGE`를 추가한다.
- 내역 응답: `{items:[{gameSessionId,gameCode,status,myResult,settlementStatus,endedAt}],nextCursor,hasNext}`.
- 게임별 전적: `GET /api/v1/users/me/game-stats`, 응답은 `{items:[{gameCode,played,wins,losses,forfeits,draws}]}`.
- `gameSessionId`와 커서는 양수 BIGINT 문자열이다. FE는 Number로 바꾸지 않으며 서버의 ID 내림차순을 유지한다. 종료 시각으로 다시 정렬하지 않는다.
- `played = wins + losses + forfeits + draws`. 기권을 패배에 더하지 않는다. 집계되지 않은 게임을 임의의 0전으로 만들지 않는다.
- 무효 경기와 null 판정은 승패로 추정하지 않는다. 통계는 서버 집계를 사용하고, 목록의 `PENDING` 정산을 완료로 표시하지 않는다.

## 화면과 인증

`공원 → 내 메뉴 → 내 전적`에서 열 수 있다. 기존 프로필 메뉴의 모달과 입력 소유권을 사용하며 전적 화면은 지연 로딩한다.

화면이 열리면 내역과 통계를 병렬 조회한다. 통계는 전체 게임 기준이고, 아래 게임 필터는 경기 내역에만 적용된다. 다음 페이지 실패 시 이미 승인된 내역과 커서를 보존하여 재시도한다. 새로 조회는 두 API를 다시 읽는다. 날짜는 한국 시간으로 표시한다.

두 경로는 기존 `ParkRuntime.requestJSON`의 GET 허용 목록에만 추가했다. 기존 Access Token Bearer 전송, 401 재인증, 인증 종료 동작을 공유한다. 새로운 로그인 우회나 별도 토큰 저장은 없다.

요청은 `cache:no-store`, 12초 제한과 AbortSignal을 사용한다. 창 닫기·필터 변경·새 조회·계정/연결 변경 시 이전 응답이 다른 화면에 표시되지 않도록 요청 범위를 검사한다. 기록은 컴포넌트 메모리에만 보관하며 로그아웃 후 남기지 않는다.

## 검증 범위

관련 단위 테스트는 큰 ID·커서, 정렬·중복·다음 페이지 검증, 별도 기권 집계, 무효/null/정산 상태, 서버 집계 불일치 거절, 인증된 GET과 허용하지 않는 요청 차단을 확인한다.

브라우저 테스트는 기존 HTTP/WS 모의 계약 환경에서 메뉴 진입, 20개 이후 추가 조회, 게임 필터, 기권·패배 구분, 독립 오류·재시도, 늦은 응답 무시, 401 재인증과 로그아웃을 확인한다. 기존 프로필 메뉴 회귀도 함께 검사한다. Browser 플러그인이 제공되지 않아 프로젝트 Playwright와 Edge를 사용한다.

2026-10-29 FE 검증 결과:

- `pnpm exec vitest run tests/unit/gameHistory.test.ts tests/unit/movementRuntime.test.ts`: 62개 통과.
- `pnpm typecheck:tests`, `pnpm build`: 통과. 기존 Three.js/번들 크기 경고는 유지된다.
- Playwright `game-history.spec.ts`, `park-menus.spec.ts`: 14개 통과. 전적 7개와 기존 메뉴 7개를 검증했다.
- Edge, `http://127.0.0.1:5278`, 1920×1080·390×844·320×568. 화면 제목·내용·포커스·실제 버튼 동작·오류 오버레이·관련 런타임 오류·스크린샷을 확인했다.
- 320px에서 기존 계정 버튼 폭이 사라지는 문제를 보완했다. 500px 이하에서만 계정 바를 채널 카드 아래로 배치하고 드롭다운 너비를 화면 안으로 제한한다.
- 처음 실행 시 Vite의 기존 의존성 캐시가 만료되어 앱 로딩이 실패했다. 검증 전용 캐시를 저장소 밖에 분리해 재실행했으며, 프로젝트 설정/의존성은 변경하지 않았다.

### 실제 개발 서버 확인과 한계

의자 실시간 동기화 후속 작업에서 BE MR !192가 포함된 `dev(a6b06d6)` 위로 충돌 없이 반영했다. 전적 서비스·화면·단위 테스트는 보존했고, 의자/활동 작업과 함께 전적 7개·프로필 메뉴 7개 브라우저 회귀를 다시 통과했다. 전체 후속 검증은 [PUBLIC_CHAIRS_FE_INTEGRATION.md](./PUBLIC_CHAIRS_FE_INTEGRATION.md)에 기록했다.

- `https://dev-api.on-top.world/api/v1/users/me/games?size=20`: 인증 없는 요청에서 `401 AUTH_AUTHENTICATION_REQUIRED` 확인.
- `https://dev-api.on-top.world/api/v1/users/me/game-stats`: 인증 없는 요청에서 같은 401 확인.
- 개발 서버 `/v3/api-docs`는 Nginx 404여서 라이브 Swagger 스키마를 가져오지는 못했다.
- 이번 작업 환경에는 개발 서버의 유효한 로그인 Access Token이 없어 **인증된 실제 200 응답과 계정의 저장된 전적까지 검증하지 않았다.** 정상 응답 구조는 위의 머지된 BE 계약·DTO·HTTP 테스트와 대조했고 FE 표시·요청 흐름은 모의 응답으로 검증한다.

개발 환경에 FE 반영 후 로그인한 계정으로 전적 조회를 확인하고, 실제 종료 경기·기권·커서·정산 대기 기록을 대조해야 한다. 이 검증을 위해 새 결과를 만들거나 경기/지갑 정산을 FE에서 실행하지 않는다.
