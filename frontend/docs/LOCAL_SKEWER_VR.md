# 온탑 꼬치왕 · 독립 WebXR 게임

Quest 2와 키보드·마우스로 즐기는 1인 주문 조립 게임이다. 게임별 구현은 `src/features/skewer`, VR 존 선택·이용권 연결은 `src/features/vrZone`에 둔다. 공원 통합·실제 서버 이용료·현재 기준은 [VR_ZONE_INTEGRATION.md](VR_ZONE_INTEGRATION.md)를 따른다.

## 독립 실행

frontend 폴더에서 다음을 실행한다.

```powershell
.\scripts\start-skewer.ps1
# 또는 node node_modules/vite/bin/vite.js --config vite.skewer.config.ts
```

- `http://127.0.0.1:5187/skewer.html`: 로그인 없는 무료 연습.
- `http://127.0.0.1:5187/vr-zone.html`: 무료 연습으로 들어가는 VR 건물 미리보기.
- 실제 공원은 `scripts/start-skewer-park.ps1`로 실행하며 VR 건물 내부에서 무료 2인 협동을 연다.

## 규칙

토마토·피망·새우·고기는 각각 1개, 치즈·베이컨은 앞끝과 뒤끝 2개를 사용한다. 주문의 재료 순서와 감싼 위치를 맞추며 꼬치 전체를 반대로 만든 경우도 정답이다. 치즈·베이컨은 앞끝 → 감쌀 음식 → 뒤끝 순서다.

주문당 35초, 인사는 3초 안에 성공하면 +1점이다. 최대 주문 12개와 인사 2개를 섞고 마지막 5장 안의 영업 종료 카드로 한 판을 끝낸다. 틀린 서빙은 그 주문의 결과로 확정된다. 꼬치는 다음 주문에서도 재사용하며 끝 재료부터 한 개씩만 뺄 수 있다.

시작은 3 → 2 → 1 각 1초, 시작! 0.5초이며 이후 주문 타이머가 흐른다. 종료는 완료! 1.1초 뒤 중앙 결과 팝업을 연다. 화면 숨김·XR 포커스 상실 시 정지하며 남은 시간부터 재개한다.

## 조작

| 동작 | PC | VR |
| --- | --- | --- |
| 음식 선택 | 클릭 / 1–6 | 트리거를 누른 채 집기 |
| 꽂기 | Space / 꼬치 끝으로 드래그 | 중심·축을 맞춘 후 트리거 해제 |
| 꼬치 잡기 | 고정 조리대 | 그립을 누른 채 집고 회전 |
| 서빙 | Enter / 서빙하기 | 뒤쪽 접시에 수평으로 가져가 그립 해제 / 월드 버튼 |
| 끝 재료 빼기 | Backspace / 버튼 | 월드 버튼 |
| 정지·재개 | Esc / 버튼 | 월드 버튼 |

PC 오른쪽 드래그는 시점 회전, 휠은 확대, 원형 화살표는 시점 초기화다. 숫자 선택 후 Space가 꽂기로 동작하며 직접 포커스한 버튼의 Enter/Space는 기본 활성화를 유지한다. 결과 팝업 바탕의 Enter로는 새 판을 구매하지 않는다.

VR은 Three.js immersive-vr/local-floor와 양손 컨트롤러를 사용한다. 꽂기 판정은 중심 거리 6.5cm·축 각도 20도 이내의 스냅이며 실제 관통·연체 물리 시뮬레이션은 아니다. 월드 주문판·정지/재개·인사·재료 회수·재도전 버튼을 제공한다. 진동은 지원 기기에서만 사용한다. 실제 Quest 2의 높이·도달 거리·FPS·진동은 실기기 검수 대상이다.

## 결과·자원

실제 주문 기록의 점수·성공률·인사 보너스를 결과에 표시하고, 설명서와 주문별 기록을 열 수 있다. 다시 도전하면 무료 연습을 새로 시작한다. 점수는 엽전 보상으로 바뀌지 않는다.

음식 모델·공유 재질은 `foodModels.ts`, `surfaces.ts`, 입력/월드 표시는 `SkewerScene.ts`, 게임 규칙은 `game.ts`, 안내는 `presentation.ts`, 결과는 `SkewerResult.tsx`다. 원작 카드 도안은 복제하지 않는다. 기존 이미지와 재질 생성 기록은 게임 art 폴더와 VR 존 generation.json에 둔다.

효과음은 사용자 동작 후 합성하며 음소거를 PC/VR이 공유한다. reduced-motion에서는 꽂기 애니메이션·입자 효과를 줄인다. 탭을 나간 뒤에는 연습 진행이 복원되지 않는다.

## 검사

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/unit/skewer.test.ts tests/unit/skewerPresentation.test.ts tests/unit/skewerSurfaces.test.ts tests/unit/skewerParkEntrance.test.ts tests/unit/vrZone.test.ts
node node_modules/@playwright/test/cli.js test --config playwright.vr-zone.config.ts
node node_modules/vite/bin/vite.js build --config vite.skewer.config.ts
```

독립 빌드의 기본 출력은 `dist-skewer`다. 공원·서버 검증과 Quest USB 절차는 통합 문서를 따른다.
