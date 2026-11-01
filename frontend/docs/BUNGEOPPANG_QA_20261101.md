# 붕어빵 QA

- 기준: `origin/dev@fc2a8cb5`, 최신 생성 맵 `c05d8ada`.
- 작업 위치: `OnTop/qa-bungeoppang-20261101`, 브랜치 `fix/bungeoppang-qa-20261101`.
- 담당: `features/bungeoppang/**`, 기존 BE `minigame`의 v5 규칙·DTO·제공/종료 경로. 기존 구조를 유지한다.
- 독립 규칙 검증: `node node_modules/vitest/vitest.mjs run tests/unit/bungeoppangV5*.test.ts`.
- 최신 맵 검증: `node node_modules/@playwright/test/cli.js test --config playwright.bungeoppang-qa.config.ts`, 포트 5237.

## 변경과 계약

준비화면 이미지는 고정 높이와 cover 크롭을 제거하여 원본 비율로 전체를 표시한다. 작은 화면은 기존 패널 스크롤을 사용한다.

새 판 `v5-20261101.1`은 `rules.queueComplaintPenalty=5`를 발급한다. 도착 순서가 3번 이상 뒤인 손님을 먼저 제공하면, 기다리던 각 손님마다 최초 한 번 -5점과 컴플레인 말풍선을 표시한다. 순서는 전역 ID 차이가 아니라 처음 자리와 승인된 교체 제공 순서로 계산한다. 1~2명 차이는 감점하지 않는다.

`checkpoint.complainedOrderIds`로 제공 승인·복구 후 중복 감점을 막는다. 서버는 발급 주문과 전체 승인 로그에서 점수를 재계산하며 클라이언트 점수를 신뢰하지 않는다. 이전 저장 규칙에서 새 필드가 없으면 0으로 처리하여 기존 2분·3분 판의 규칙과 해시를 유지한다. 음수 점수는 허용하되 계산 보상은 최소 0냥이며 기존 지갑/상한/멱등성 경로를 재사용한다.

공통 연결 변경은 기존 `MinigameService` v5 경로와 v4 재사용 파서의 v5 분기에 한정한다. v4 음수 입력 거부는 유지한다. 신규 migration·DB 위치·번호 사용 없음(V133 포함).

## 검증

FE 관련 57개, BE 규칙·제공·재시도·완료·HTTP·계약 87개 통과. 소스/테스트 타입 검사 통과. 최신 맵 Edge E2E 2개 통과: 준비화면 1920/1280/390 너비의 이미지 비율·시작 버튼 접근, 게임 진입·조리·공원 복귀. 기존 Three.js/셰이더 경고 유지.

HTTP/WS 및 미니게임 발급은 테스트 대역이다. BE는 테스트 환경에서 검증했으며 실제 MySQL/운영 서버 연동 검증과 구분한다. 전체 게임 통합은 후속 통합 브랜치에서 확인한다.

## 추가 화면·지급음 QA

기준 `origin/dev@9aa745ea`, 브랜치 `fix/bungeoppang-polish-20261101`, 같은 작업 위치. 독립 실행은 `node node_modules/@playwright/test/cli.js test --config playwright.bungeoppang-polish.config.ts`이며 포트 5242에서 최신 생성 맵을 사용한다. Browser 플러그인이 제공되지 않아 기존 Playwright와 Edge를 사용했다.

준비 이미지의 CSS `aspect-ratio:auto`가 로딩 전 크기 예약을 해제하여 패널이 잠깐 작아지는 원인이었다. 실제 세 이미지의 800:686 비율을 지정하여 지연 로딩에도 크기를 유지하고 전체 이미지를 표시한다. 컴플레인은 붉은 말풍선·경고 기호·강조된 −5점과 접근성 알림으로 표시한다. 감점 판정과 손님당 한 번 규칙은 유지한다. 전달·결과의 특수 점수 문구와 랭킹 하단 서버 설명을 제거하고 금빛 붕어빵 양각 메달로 교체한다.

공통 변경은 `audio/ParkSfx.tsx`와 `features/wallet/RewardCoinFlight.tsx`이다. 붕어빵 종료 처리 중 먼저 도착한 잔액 갱신으로 소리가 나는 것을 막고, 결과의 서버 확정 양수 지급 문구가 실제 보일 때 `soundOnReveal` 선택 속성으로 한 번 재생한다. 공원 지갑이 숨겨져 있어도 재생하며, 기존 지급 영수증 중복 방지로 결과를 다시 열어도 반복하지 않는다. 0냥·미리보기에는 재생하지 않는다. 다른 게임은 기본 속성을 사용하며 지급·잔액 계산과 통신 계약을 바꾸지 않는다.

최신 맵에서 이미지 지연 수신·반응형 준비화면·경고 표시와 복귀·지급음 선행 방지·재진입 중복 방지·0냥·2분/3분 랭킹·손님과 공원 복귀를 검증한다. HTTP/WS와 결과는 계약 대역이며 실제 서버 보상 지급은 검증하지 않았다. BE·DB·Flyway 변경 및 V133 사용 없음. 전체 통합 결과는 통합 문서에 기록한다.
