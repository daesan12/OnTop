# 게임 화면 브라우저 단축키 보호 (FE)

작성일: 2026-10-28 · 기준: 로컬 origin/dev `0d20b3b` · BE/인프라 변경 없음

최신 통합: 2026-10-29 원격 fetch 후 `origin/dev` `7f63ef3`에 rebase했다. Playwright 제외 목록 충돌 1건은 최신 `notes-preview.spec.ts`와 이번 `browser-shortcuts.spec.ts` 제외를 모두 보존하여 해결했다. 기존 게임 접근/채팅/시설/메모판 변경을 유지했고, MR 변경 파일은 모두 `frontend/` 하위다.

통합 후 재검증: FE 전체 단위 테스트 112개 파일/1,038개 통과, 소스·테스트 타입 검사 통과, 운영 빌드 및 M00–M14 배포 경계 검사 통과, 전용 Edge E2E 2개 통과. E2E의 예외/console.error/오류 오버레이가 없으며, 2026-10-29 캡처는 `OnTop/output/browser-guard-qa-20261029/browser-shortcuts-park.png`에 보관했다. 아래 2026-10-28 결과는 최초 구현 검증 기록이다.

## 목적과 보장 범위

게임 화면에 전달되는 브라우저 단축키의 기본 동작 취소를 시도하고, 해당 입력이나 화면 이탈 때 조작 상태가 남지 않도록 한다. **개발자 도구 접근 또는 부정 조작을 완전히 차단하는 보안 기능은 아니다.** 브라우저 메뉴, 이미 열린 개발자 도구, 원격 디버깅, 확장 프로그램, 직접 HTTP/WS 호출, 다운로드한 JS 수정은 FE가 통제하지 못한다. F11은 전체화면 전환이며 그 자체가 개발자 도구나 게임 조작 기능은 아니다.

브라우저가 키를 페이지에 전달하지 않거나 취소 불가로 전달하면 제한할 수 없다. ESC를 통한 전체화면·마우스 고정 해제와 브라우저의 사용자 탈출 기능을 유지한다. 창 크기 차이·실행 시간·콘솔 접근으로 개발자 도구를 탐지하거나 강제 로그아웃/기권/패배/보상 회수를 하지 않는다.

## 적용 조건

- 운영 빌드(`import.meta.env.PROD`)의 `ParkPage`에서 활성화한다. 로그인·OAuth·온보딩·관리자 화면에는 설치하지 않는다.
- 로컬 개발에서는 기본 비활성화하여 디버깅을 유지한다. QA는 `VITE_BROWSER_SHORTCUT_GUARD=true`로 운영과 같은 정책을 사용한다. 이 변수로 운영 빌드를 끌 수는 없다.
- `useLayoutEffect`에서 window 캡처 리스너를 설치한다. 안내서·이모트·모달의 일반 effect 캡처 리스너보다 먼저 처리한다. 화면 해제와 React StrictMode 재설치 때 리스너를 정리한다.

## 입력 정책

| 입력 | FE 처리 |
| --- | --- |
| F11 / F12 | 페이지에 전달된 취소 가능한 이벤트의 기본 동작 취소 시도 |
| Ctrl+Shift+I/J/C/K | Windows/Linux 개발자 도구 진입 단축키 제한 시도 |
| Command+Option+I/J/C/K, Command+Option+U | macOS 개발자 도구·소스 보기 단축키 제한 시도 |
| Ctrl 또는 Command + U/S/P/R (Shift 포함) | 소스 보기·저장·인쇄·새로고침 제한 시도 |
| F5 (수정키 포함) | 새로고침 제한 시도 |
| WASD/방향키/Shift/Space/E/V, R/Q/T 등 | 기존 게임 조작 유지 |
| F1 / Esc / Tab | 기존 안내서·닫기·키보드 탐색 유지 |
| Ctrl/Command + A/C/V/X/Z/Y, 찾기, 확대·축소 | 기존 편집·접근성 기능 유지 |
| 브라우저 탭 닫기·주소창·탭 전환·이전 페이지 | 제한하지 않음 |
| 텍스트 입력 중 IME 조합·AltGraph | 조합 입력 우선 |
| 우클릭 | 기존 정책 유지: 공원 기본 메뉴 취소, 텍스트 편집 메뉴와 캐릭터 게임 메뉴 유지 |

단축키 keydown을 차단하고 같은 키의 keyup도 추적한다. 수정키를 먼저 떼어도 해당 keyup을 정리한다. 차단된 문자 키 때문에 Ctrl 단독 탭이 잘못 판정되어 마우스 고정이 켜지는 경우를 방지한다. OS/브라우저별 실제 단축키는 서로 다르므로 표는 페이지가 처리하는 정책 범위이며 모든 브라우저의 메뉴를 포괄한다는 뜻은 아니다.

## 조작 정리

`ontop-browser-interrupt`는 현재 탭의 일시적 입력만 정리한다.

- 제한 단축키 첫 keydown, 창 blur, 숨겨진 탭의 visibilitychange, pagehide, DOM fullscreenchange 때 전달한다.
- 이동·달리기·점프 입력/드래그를 지우고 기존 `parkRuntime.stopMovement()`를 호출한다. 마우스 고정 및 예약된 자동 복귀도 취소한다.
- 이모트 휠은 선택 전송 없이 닫고 주사위 컵의 일시적 조작은 취소한다.
- 채팅 원문·서버 경기·차례·제한시간·기권·정산은 바꾸지 않는다. 이미 전송한 게임 행동을 취소하거나 되돌리는 이벤트가 아니다.
- 화면으로 돌아왔다고 마우스 고정을 자동 재요청하지 않는다. 사용자의 새 Ctrl 입력을 따른다.
- DOM 전체화면과 브라우저 F11 전체화면은 다르다. 브라우저가 keydown/fullscreenchange/blur를 전혀 전달하지 않는 상황은 감지·정리 보장 범위 밖이다.

## 재현 및 검증

```sh
pnpm exec vitest run tests/unit/browserShortcuts.test.ts tests/unit/mouseLook.test.ts tests/unit/movementRuntime.test.ts tests/unit/dicePresentation.test.ts
pnpm typecheck
pnpm typecheck:tests
pnpm test:e2e:browser-guard
pnpm build
```

Browser 플러그인/스킬이 이 세션에 없어 프로젝트 Playwright + 로컬 Edge를 사용했다. 전용 설정은 서버 실행에 설치된 Vite CLI를 직접 사용하고, 기존 일반 E2E에서는 opt-in 시나리오를 제외한다. HTTP/WS는 기존 `contractFixture` 대역을 사용하며 실제 BE 보안 검증과 구분한다.

자동 검증 범위: 단축키/보존 입력 매트릭스, 취소 불가능한 이벤트, 수정키 keyup 순서, 반복 입력, lifecycle/리스너 정리, Ctrl 마우스 고정 회귀, 실제 브라우저 이벤트 취소·이동 정지·안내서 모달 우선순위·채팅 선택/원문 유지·로그인 제외. 이벤트 취소 검증은 브라우저의 개발자 도구 UI가 모든 경로에서 닫혔다는 증거가 아니다.

### 이번 검증 결과

2026-10-28, Windows Edge headless, `http://127.0.0.1:5197`, 1920×1080, 개발 서버에 QA 플래그 활성화:

| 검사 | 결과 |
| --- | --- |
| 신규 단축키 및 기존 마우스/이동/주사위 회귀 | 4개 파일, 106개 테스트 통과 |
| 소스/테스트 TypeScript 검사 | 통과 |
| Playwright 브라우저 E2E | 2개 통과 |
| 주소·페이지 제목·공원 실화면·Vite 오류 오버레이 | 정상 / 오버레이 없음 |
| 런타임 예외·console.error | 없음 |
| 운영 빌드 | 성공, 생성 `.map` 파일 0개 |
| FE 변경 범위 및 `git diff --check` | frontend 하위만 변경 / 통과 |

검증 경로: 계약 대역 로그인 → 공원 → 14종 실제 단축키 입력 → Ctrl 마우스 고정 오작동 없음 → 이동 중 F12 및 4종 lifecycle 이벤트로 정지 → G 휠 열기/F12 취소/감정표현 전송 없음 → F1 안내서 안에서 F12 → Esc 닫기 → Enter 채팅 → Ctrl+A 선택 → Ctrl+U 뒤 원문 유지. 로그인 화면에서는 별도로 F12가 취소되지 않는 것을 확인했다. 주사위 컵은 준비 상태에서 인터럽트가 오면 idle로 복귀하고 행동을 전송하지 않는 단위 테스트를 추가했다.

QA 캡처는 저장소 밖 `OnTop/output/browser-guard-qa/browser-shortcuts-park.png`에 보관했다. 기존 Three.js Clock 폐기 예정/셰이더 정밀도 경고 및 번들 크기 경고는 남아 있으며 이번 변경의 런타임 오류와 구분했다. macOS/Firefox/Safari의 실제 브라우저 메뉴, OS 예약 키, 모바일, 실제 BE 보안은 이번 자동 검증 범위에 포함하지 않았다. 소스맵 미생성 역시 JS 공개·변조를 차단한다는 뜻은 아니다.

배포 전 수동 확인이 필요한 항목:

1. 실제 운영 빌드로 Chrome/Edge/Firefox, macOS Safari에서 일반 화면·F11 전체화면·이미 열린 개발자 도구를 각각 확인한다.
2. WASD 이동 또는 마우스 고정 중 F11/F12·탭 전환·브라우저 메뉴 열기를 시도한다. 페이지에 이탈 이벤트가 전달되면 이동이 멎고 복귀 뒤 Ctrl을 새로 눌러야 마우스 고정이 켜져야 한다.
3. 안내서/상점/이모트/주사위 컵/채팅에서 제한 키를 눌러도 게임 제출·기권·감정표현 전송이 일어나지 않아야 한다. 채팅은 입력·복사·붙여넣기·IME·텍스트 우클릭이 유지되어야 한다.
4. Esc·탭 닫기·주소창으로 이탈할 수 있어야 한다. 화면 크기 변화나 개발자 도구 사용만으로 패배·로그아웃·지급 취소가 생기면 안 된다.
5. 개발자 도구를 먼저 열거나 직접 API를 호출해도 서버가 권한·시간·정산을 검증하는지 BE가 별도로 검증한다. 요청은 [BE 전달 문서](BROWSER_GAME_INTEGRITY_BE_REQUEST.md)를 사용한다.

## 근거

- [MDN preventDefault](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault): 취소 불가능한 이벤트에는 기본 동작 취소가 효과가 없다.
- [MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API): 사용자는 Esc 또는 F11 등으로 전체화면을 해제할 수 있다.
- [WHATWG Fullscreen](https://fullscreen.spec.whatwg.org/): 사용자 탈출 및 OS 키는 브라우저 보안 경계에 속한다.
- [MDN client-side validation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation): 클라이언트 검증을 우회할 수 있으므로 서버 검증이 필요하다.
