# 여러 게임 동시 수정 작업 규칙

기준: 2026-10-27. 원카드 작업 폴더 `OnTop/frontend-onecard-ux`, 브랜치 `feat/frontend-onecard-ux`, 기준 `2930a56`.

게임마다 별도 git worktree/브랜치를 사용한다. 기존 오목·태블릿·공원 폴더의 작업 중 변경을 복사하거나 덮어쓰지 않는다. 원카드 개발 서버는 5212, 별도 e2e는 5213을 사용한다. 다른 게임 서버 포트를 점유하지 않는다.

| 소유 영역 | 원칙 |
| --- | --- |
| src/game/onecard/** | 원카드 UI·상태·카메라 수식·관전 이벤트·스타일 |
| tests/unit/onecard* / tests/e2e/onecard* | 원카드 검증 |
| docs/onecard* / frontend/docs/ONECARD* | 기획·계약·작업 명세 |
| CameraRig·Avatars·AvatarOverlays | 게임별 함수를 호출하는 최소 연결만 수정 |
| runtime/contracts·SpringParkRuntime | 선택적 게임 포트·기존 소켓 어댑터 연결만 수정 |

다른 게임의 CSS 선택자·game store·공통 프로토콜 규칙은 변경하지 않는다. 새 공통 추상화를 만들기 위해 다른 게임을 일괄 리팩터링하지 않는다. 원카드 CSS는 `.onecard-panel` 또는 `.onecard-overhead` 아래로 한정한다.

통합 시 공통 연결부는 같은 파일의 기존 게임 분기를 보존해 병합한다. 기준 브랜치에서 진입·준비·시작·결과 흐름이 바뀌면 해당 선행 흐름에 맞춘다. 머지 전 typecheck·원카드 unit/e2e와 공통 camera/overlay/runtime 관련 회귀를 수행한다. 설치된 같은 lockfile의 의존성은 개발 시 공유 가능하나 소스/빌드 출력은 각 worktree에 둔다.
