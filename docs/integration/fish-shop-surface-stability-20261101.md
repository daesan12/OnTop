# 붕어빵 가게 표면 떨림 수정

## 최신 dev 통합 확인 (2026-11-01)

기존 미커밋 변경을 Git stash에 보존하고 최신 `origin/dev@5df6447c`까지 반영했다. 표면 변경은 충돌이 없고 최신 맵 해시는 동일하다. 표면/기존 공원 피드백 단위 테스트 2파일 3개, FE/테스트 타입 검사, park-integration 빌드가 통과했다. 표면 카메라 이동과 등불 낮·밤 브라우저 시나리오 2개도 최신 dev에서 통과했다. 아래 기준과 커밋 보류 설명은 최초 작업 이력이며 현재 사용자 승인 범위는 커밋·푸시·MR·머지·브랜치 삭제까지다.

- 작업 위치: `OnTop/fish-shop-surface-stability`
- 브랜치: `fix/fish-shop-surface-stability-20261101`
- 기준: 시작 및 통합 검증 직전 fetch로 확인한 `origin/dev@d8a571f0`.
- 맵: `c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`.
- 담당 범위: 공원 붕어빵 가게 외관의 차양. 다른 에셋을 일괄 수정하지 않았다.
- 앞선 오디오·운동 보상 작업은 `OnTop/jumpmap-audio-fitness-idle`에 보존했다.

## 원인과 수정

빨강·크림색 차양을 구성하는 12개 조각의 폭이 실제 간격보다 0.015m 크게 만들어져 있었다. 이 때문에 11개 경계에서 서로 다른 색의 경사면과 앞쪽 천이 같은 깊이에 겹쳤다. 카메라 이동에 따라 깊이 검사 결과가 바뀌는 z-fighting의 원인이다. 차양 경계 좌우 3mm·6mm, 경사면과 앞쪽 천을 검사한 88개 지점 모두에서 수정 전 두 색 면이 동시에 검출됐다.

`frontend/src/world/art/luckyFacilityGeometry.ts`의 붕어빵 전용 두 `fish.box` 폭에서 `+.015`를 제거했다. 서로 다른 색 조각은 같은 깊이에서 겹치지 않고 경계에서 맞닿는다. 수정 후 88개 지점 모두 단일 색 표면이고 빈 구멍은 검출되지 않았다.

공통 파일 내 붕어빵 차양 생성 부분만 수정했다. 복권방·다른 건물 생성, 전체 카메라 깊이 설정, 공통 재질, 맵 좌표·충돌, 게임 규칙·통신·정산은 변경하지 않았다. BE·Flyway 변경 및 번호 예약이 없으며 V133을 사용하지 않았다.

## 독립 실행

작업 폴더의 `frontend`에서:

```powershell
node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5226 --strictPort
```

`http://127.0.0.1:5226/park`에서 가게를 볼 수 있다. 정상 앱은 실제 로그인·서버 연결이 필요하다. 테스트는 기존 최신 맵 `parkFixture`와 붕어빵 v5 preview service를 사용하므로 실제 로그인·보상·DB 지급 검증과 구분한다.

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/fishShopSurfaces.test.ts tests/unit/fishShopLanterns.test.ts tests/unit/luckyFacilities.test.ts
node node_modules/@playwright/test/cli.js test --config playwright.fish-surfaces.config.ts
node node_modules/@playwright/test/cli.js test --config playwright.park-bungeoppang.config.ts bungeoppang.spec.ts
```

첫 Playwright 명령은 5226에서 표면과 낮·밤 등불을 검사한다. 기존 조리 진입/복귀 명령은 별도 5202 포트를 사용한다. 테스트 서버는 각 실행 종료 시 정리한다. 의존성은 동일 lockfile의 기존 설치를 junction으로 공유했다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| 수정 전 재현 | 단위 및 브라우저 검사 모두 88개 지점에서 두 색 겹침 검출 |
| 수정 후 표면·등불·기존 시설 단위 테스트 | 3파일 8개 통과 |
| 최신 맵 브라우저 표면 검사 | 88개 지점 단일 표면, 가게 중복 배치 없음 |
| 카메라 세 위치에서 가게 변환 행렬 비교 | 동일, 가게 자체 위치 변화 없음 |
| 낮 → 밤 → 낮 등불 회귀 | 통과 |
| 가게 진입 → 조리 → 종료 → 공원 복귀 | 기존 테스트 통과, 복귀 중 조리 카트 노출 없음 |
| FE 타입 검사·테스트 타입 검사 | 통과 |
| 최신 맵 생성물 정합성 | 통과, 맵 파일 갱신 없음 |
| park-integration 빌드·diff 공백 검사 | 통과 |

Browser 플러그인이 없어 기존 Playwright/Edge를 사용했다. `http://127.0.0.1:5226/park`, 1920×1080 및 740×900 화면을 검증했다. 페이지 URL·제목, 장면 로드, 카메라 이동 뒤 화면, Vite 오류 오버레이와 pageerror도 확인했다. 기존 Three.Clock 사용 중단·셰이더 정밀도·큰 빌드 청크 경고는 관측됐다.

브라우저는 통신 대역을 사용했다. 실제 운영 서버 다인 플레이·배포 후 검증, 다른 에셋 전체의 떨림 점검은 이번 범위에 포함하지 않았다. 커밋·푸시·MR·병합·배포를 수행하지 않았다. 후속 앱 내 검증에는 Browser 플러그인을 설치할 수 있다.
