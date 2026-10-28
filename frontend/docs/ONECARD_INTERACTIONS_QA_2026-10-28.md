# 원카드 조작·뿅망치·붕어빵 랭킹 FE 검수

## 반영 범위

- 실제 테이블 덱 클릭으로 한 장 뽑고 차례 넘기기. 공격 중에는 기존 공격 받기 명령. 빈 덱 재구성·카드 판정은 서버에 맡긴다.
- 합법 손패를 위로 끌어 놓으면 한 번 제출한다. 짧은/옆 방향 끌기, Escape, 포커스 이탈, 포인터 취소, 턴·버전·권한 변경에서는 취소한다. 기존 선택/제출 버튼과 키보드 접근을 유지한다.
- 서버 승인된 공개 변화에만 카드 이동·스프링 착지 효과를 표시한다. 상대 앞면을 3D 장면에 넣지 않는다. 모션 줄이기 설정을 지원한다.
- 게임판 펠트·테두리·덱 영역을 다듬고, 원카드 버튼을 로비와 어울리는 베이지·회색·검정으로 통일했다.
- 손패 정리 옆에 뿅망치 들기를 추가했다. 승인된 관전자 손 뻗기 → 대상에게 반투명 손 → 손 클릭/망치 타격 → 서버 승인 후 그 관전자만 3초 차단하는 제안 계약 어댑터다.
- 붕어빵 결과에 전체 랭킹 요약과 상세 참여자 목록을 추가했다. 개인 최고 기록, 완성 내림차순·실수 오름차순·동점 공동 순위·이른 완료 우선. v4/v5 기록을 분리한다.
- 비동기 목록에서 포커스된 버튼이 사라져도 Escape로 최상단 결과/랭킹 창을 닫을 수 있다.

## 활성화와 BE 의존성

게임 조작·버튼·매트·뿅망치 들기 연출은 FE 변경이다. 실제 다중 사용자 방해 차단과 전체 기록 저장·조회는 BE 구현이 필요하다. 제안 기능의 서비스 기본값은 비활성이다. 서버가 없는 상태에서 가상 순위나 차단을 표시하지 않는다.

계약과 통합 검수 항목: [BE 요청](handoff/원카드_뿅망치_붕어빵_전체랭킹_BE요청_2026-10-28.md). 이미지 생성 이력: [에셋 기록](art/onecard-prank-assets.md).

## 재현

`frontend`에서 다음 명령을 실행한다. Browser 플러그인이 제공되지 않아 프로젝트 Playwright와 설치된 Edge를 사용했다. 테스트는 명시적 로컬 계약 fixture이며 실제 서버 배포 검증을 뜻하지 않는다.

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --project tsconfig.tests.json --noEmit
node scripts/check-migration-boundary.mjs
node scripts/publish-rulebooks.mjs
node node_modules/vite/bin/vite.js build

$env:ONECARD_PREVIEW_PORT='5235'
node node_modules/@playwright/test/cli.js test --config playwright.onecard.config.ts onecard-interactions.spec.ts onecard-ux.spec.ts onecard-controls.spec.ts onecard-four-player.spec.ts game-additions-disabled.spec.ts
node node_modules/@playwright/test/cli.js test --config playwright.game-additions.config.ts
```

## 검증 결과

최신 `dev` 기준 `3da2647`을 작업 브랜치에 충돌 없이 병합했다. 병합본에서 전체 단위 테스트 104개 파일·920건, 앱/테스트 타입 검사, migration 경계 검사, 프로덕션 빌드가 통과했다. 브라우저 고유 시나리오 16건을 검수했다.

- 덱 실제 mesh 클릭·승인 카드 이동, 드래그 제출·취소·오류·턴 변경·공격·빈 덱·복구·만료·재전송 차단.
- 플레이어/관전자 두 창, 선택 카드 보호, 뒤집기/손패 정리, 공개 카드만 노출, 기존 지도 차단·기권 복구.
- 새 제안 플래그 활성 테스트에서 투명 손·승인 타격·3초 차단·다음 턴/시간 경과·방어하지 않은 뒤집기, 턴 변경 취소.
- 전체 랭킹 요약/상세, 동점 1·1·3 및 완료 시각 순서, 다음 페이지·오류/재조회·빈 목록·Escape 복귀. 기본 플래그 비활성일 때 순위 조회 0건·가상 참가자 0명.
- 1920×1080, 1280×720, 390×844 및 터치/모션 줄이기. 최종 캡처로 버튼·카드·뿅망치와 결과/상세 화면을 직접 확인했다.

기존 Three.js Clock/일부 셰이더 정밀도 안내 및 큰 번들 경고는 남는다. 이번 변경의 실행 오류나 테스트 실패는 아니다. BE 확정 계약·배포 이후 실제 계정 공동 검수가 필요하다.
