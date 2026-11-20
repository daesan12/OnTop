# Vitest 불필요한 검증 내용 정리

assertion에 쓰이지 않는 반복 계산과 같은 계약을 중복 확인하는 내용을 삭제하고, 필요한 기능·진단·소스 보존 검사는 유지한다. 아래 기존 테스트 정리에 더해, 2026-11-20에는 공통 통신·조작 모듈이 불필요하게 공원 지형을 생성하는 import 경로를 개선했다. Jenkins, Vitest 실행 설정, package script 및 의존성은 변경하지 않는다.

## 삭제한 내용과 남긴 검증

| 대상 | 삭제한 내용 | 유지한 검증 |
| --- | --- | --- |
| `jumpRopeGrandpaHuman.test.ts` | assertion 없이 결과 표에만 쓰던 두 사람의 과거 설정 시뮬레이션 600회 | 현재 설정의 사람 3종 × seed 300개와 assertion에서 사용하는 과거 설정 300회, 기존 판정 기준 |
| `legacyCollisionVersion.test.ts` | 다른 파일에서 중복 검사하는 테스트 파일 | 고유한 schema version 및 frontend-test 정본 동등성 검사를 `worldMapParity`, `frontendTestLayout`에 통합 |
| `generatedServiceMap.test.ts`, `navigation.test.ts` | 전체 목적지의 접근 경로를 반복 탐색하는 본문 | 맵 identity·바인딩·좌표·개별 경로·입력 소유권 |
| `layoutJump.test.ts` | 실제 controller로 113개 표면을 모두 순회하는 본문 | 시작·보상·실패·게이트 순서·입력 버퍼 |
| `parkCheckpoint.test.ts` | 19,881개 좌표의 이동·높이·수영 순회와 사용하지 않게 된 import | 기존 정적 배치 데이터 checkpoint |
| `fixtures/parkCheckpoint.json` | 삭제한 순회만 사용하던 movement checksum | 기존 정적 배치 데이터 해시 전체를 값 변경 없이 보존 |

전수 탐색은 기존 사용자 지침의 실행 제외 대상이며 이번 요청에 따라 skip 본문을 남기지 않고 삭제했다. 자전거·킥보드 주행 검사는 추가하거나 실행하지 않았다.

## 원래대로 유지한 테스트

이동 trace 진단 네 파일과 `parkVisualPreservation.test.ts`는 원래 `tests/unit/` 경로와 내용으로 유지한다. 이전 MR 수정에서 추가했던 로컬 복제 파일과 호환 진입점은 제거했다. 이 다섯 파일은 최신 dev와 동일하며 기존 BE 진단 호출 및 문서의 CLI 경로도 그대로다. 기존 `tests/local-unit/` 14개와 실행 설정은 변경하지 않았다.

`parkVisualPreservation`과 `parkVisualCheckpoint.json`은 `frontend/docs/PARK_FE_INTEGRATION.md`의 소스 보존 규칙이 지정한 검사다. 단순히 주석 변경에도 실패한다는 이유만으로 불필요하다고 판단해 삭제하지 않는다. 이동 trace 진단도 재현 목적이 있으므로 환경변수에 따른 기존 실행 조건을 유지한다.

## 기존 테스트 정리의 검증 기록

- 시작 dev `6a690e05`에서 최신 `fa1516e15ea256e6ad903383dfec6e89b2dfed95`까지 이력을 보존하는 merge로 반영했다. 충돌 없음.
- 최종 관련 테스트 12개 파일: 33 passed, 5 skipped. skipped는 재현 trace 환경변수가 없는 기존 진단이며, 삭제한 전수 탐색의 본문을 실행한 것이 아니다.
- 전체 `src`와 관련 테스트의 타입 검사 통과. 정적 배치 해시 값 보존 및 목적 있는 다섯 테스트의 dev 원문 동등성도 확인했다.
- 기존 전체 테스트 타입 검사에는 수정하지 않은 `tests/e2e/admin-mole-audit.spec.ts:227`의 `window.innerWidth` 오류가 남아 있다. 이번 변경은 해당 파일을 수정하지 않는다.
- 줄넘기 같은 파일의 앞선 로컬 비교는 Node 24.18.0, Vitest 5.0.4, `maxWorkers=1`, `6a690e05` 기준으로 변경 전 11.98초, 변경 후 7.45초였다. 각 1회 측정이며 Jenkins 전체의 단축 시간을 보장하지 않는다.
- 실제 서버 연결과 전체 공원 통합 검증은 수행하지 않았다. CI 실행 조건이나 서버 자원·모듈 로딩 병목은 별도 진단 대상이다.

## 공통 통신·조작 모듈의 지형 초기화 비용 개선

최신 dev `fa1516e15ea256e6ad903383dfec6e89b2dfed95`를 포함하는 작업 브랜치에서 확인했다. 원격 dev와의 추가 통합·충돌 해결은 필요하지 않았다.

`816bda3f`에서 추가된 `facilityClient.ts`의 `SLEIGH_ID` import가 `winter/sleigh/route.ts` → `park-renewal-preview/groundSurface.ts` → `groundGeometry.ts`를 불러왔다. 새 공원이 비활성인 검사에서도 문자열 ID를 읽으려고 실제 지형을 생성했다. 파일별 격리가 켜져 있어 여러 공통 런타임 검사에서 초기화가 반복될 수 있었다.

- 시설 ID는 `winter/sleigh/constants.ts`에 두고 통신 모듈은 이 가벼운 진입점을 사용한다. 기존 `route.ts`의 ID export는 유지한다.
- 서버 탑승 명령은 `winter/sleigh/boarding.ts`로 분리한다. `controller.ts`의 기존 export도 유지하며, 조작 모듈이 렌더링용 항로·순록 대형을 불러오지 않게 한다. 요청 형식·이동 정지·성공/실패 반환은 같다.
- `parkInteraction.ts`의 광고판 높이 계산은 새 공원이 활성일 때 기존 `groundSurfaceHeight`를 로딩해 동일한 좌표를 계산한다. 비활성 모드에서는 지형 생성 모듈을 로딩하지 않는다.
- 썰매 항로·도킹·하차 좌표·지형 생성 알고리즘·서버 계약·기존 테스트 assertion은 이 import 개선에서 변경하지 않는다.

### 로컬 측정

Windows, Node 24.18.0, Vitest 5.0.4, 기존 lockfile과 의존성을 사용했다. 프로파일 산출물은 저장소 밖 `OnTop/output/fe-test-performance-20261120/`에 보관한다. 기존 `node_modules` 연결을 사용했으며 의존성을 설치·업그레이드하지 않았다.

| 실행 | 조건 | 결과 |
| --- | --- | --- |
| `benchInteraction` + `browserShortcuts`, 개선 전 | `maxWorkers=1`, 격리 유지 | 135 passed, 76.90초, import 비중 93% |
| 같은 두 파일, 통신 ID 분리 후 | 같은 worker·격리 조건 | 135 passed, 34.56초; 벤치 쪽 지형 생성 import는 남아 있었음 |
| 같은 두 파일, 조작 경로까지 분리 후 | 같은 worker·격리 조건 | 135 passed, 3.60초; `browserShortcuts` import total 399ms |
| 허용된 기본 단위 테스트 전체 | CLI에서만 `maxWorkers=2`, 격리 유지 | 360 passed files + 3 skipped files (363), 3,441 passed tests + 8 skipped tests, Vitest 200.78초 / 프로세스 wall 202.08초 |
| 제품 코드 타입 검사 | `tsc --noEmit` | 통과 |
| 제품 코드 + 전체 단위 테스트 타입 검사 | 외부 임시 tsconfig, 기존 strict 옵션 유지 | 통과 |
| 일반 / 공원 빌드 | 기존 `build`, `build:park` script, 후자는 Jenkins와 같은 기능 플래그 | 통과; Vite 18.90초 / 23.44초 |
| 최신 220m 공원 브라우저 | Chrome headless, 기존 `renewal.spec.ts`의 안내·랭킹 1개 시나리오, mock 통신 | 1 passed, 28.4초; 1440×900 / 360×640 / 720×400 |

두 파일 비교는 순차 단일 측정이며 캐시를 모두 초기화한 통계 실험이 아니다. 지형 import 경로가 사라진 사실과 로컬 개선을 확인한 결과이며, Jenkins 전체 시간을 같은 비율로 줄인다고 보장하지 않는다. 전체 실행은 기존 조건부 진단 skip을 유지하고, 맵 전수 탐색·자전거·킥보드 주행 검사는 실행하지 않았다. 기본 worker 설정·격리·실패 처리 정책을 완화하지 않았다.

2026-11-20 16:01 Jenkins `fa1516e1` 실행은 BE 4,159 tests / 0 failures 이후 FE 시작 16:21:11부터 40분간 진행하다 17:01:11 전체 timeout으로 종료됐다. 이 개선을 포함한 Jenkins 실행은 dev 병합 후 별도로 확인해야 한다. CI 자원 측정, worker 조정, 변경별 실행 범위 및 상태 기록 정책은 인프라 담당자의 작업 범위다.

전체 `tsconfig.tests.json` 검사는 변경하지 않은 `tests/e2e/admin-mole-audit.spec.ts:227`의 `window.innerWidth` 타입 오류 1개로 실패했다. 해당 파일은 원격 dev와 동일하다. 제품 코드 + 전체 단위 테스트를 포함한 별도 타입 검사는 통과했다.

브라우저 검증은 Browser plugin이 제공되지 않아 기존 Playwright를 사용했다. 로컬 URL은 `http://127.0.0.1:5388/park`, Vite mode는 `park-renewal-integration`, 지도·통신 fixture는 현재 커밋의 220m 생성물이다. 안내 열기 → 랭킹 열기 → 끝까지 스크롤 → 안내 복귀·닫기, 빈 결과·실패 후 재시도를 확인했다. 페이지 제목·의미 있는 화면·Vite overlay 없음·pageerror 없음 및 스크린샷을 확인했다. 서버 권한·실제 다인 접속·실제 헤드셋은 검증하지 않았다.

`THREE.Clock` 폐기 예정 경고와 `Park detail geometry is out of sync`(pagoda/boundary/stairs/jump) 경고는 남아 있다. 후자는 최적화 GLB가 원본 지오메트리와 호환되지 않을 때 교체를 생략하고 원본을 유지하는 경로다. 이번 변경은 그 컴포넌트·GLB·원본 지오메트리를 수정하지 않았으며, 이 경고의 에셋 재생성 작업은 범위에 포함하지 않았다. 관련 브라우저 시나리오와 일반·공원 빌드는 통과했다.

## 인프라 담당자 요청

대상은 DEV-CI의 Jenkins `ontop-dev`다. 목적은 FE 개선 적용 후 60분 제한 안에 전체 검증·배포가 완료되는지 확인하고, 필요한 경우 변경별 검사 범위를 개선하는 것이다. FE 작업 브랜치는 `refactor/frontend-vitest-cleanup-20261120`, 기존 MR은 `!651`, 대상은 `dev`다. dev 병합은 사용자 별도 승인 대상이다.

### 먼저 확인할 작업

1. 승인된 FE 수정이 dev에 포함된 뒤 그 SHA로 Jenkins를 실행한다. 처음에는 timeout·worker·격리·실패 정책을 바꾸지 않아 FE 변경 효과를 구분한다. 로컬 3분 21초 결과는 CI 완료 시간을 보장하지 않는다.
2. 실제 체크아웃 SHA, 검증 기준 `tested.sha`, 변경 플래그, BE/공원 빌드/FE 검사/배포 시작·종료 시간을 기록한다. 검증·배포를 생략하려고 기준 SHA를 수동으로 성공 처리하지 않는다.
3. 반복 대기가 남으면 실행 중인 빌드와 겹치지 않는 위치에서 같은 SHA·Node·pnpm·lockfile로 아래 두 파일을 측정한다. 먼저 worker 1개로 측정하고, 자원 상태를 확인한 뒤 2개 조건과 순차 비교한다.

```bash
cd frontend
pnpm exec vitest run tests/unit/benchInteraction.test.ts tests/unit/browserShortcuts.test.ts --maxWorkers=1 --reporter=default --experimental.importDurations.print --experimental.importDurations.limit=12
```

이 버전에서 `.print=true` 대신 위처럼 값 없는 `.print` 옵션으로 import별 표 출력을 확인했다. wall time과 transform/import/tests/worker 단계를 함께 보관한다. 통신·조작 검사에서 `groundGeometry.ts` 초기화가 다시 나타나는지 확인한다.

4. CI 호스트에서 아래 읽기 전용 상태를 수집해 Node RSS, swap-in/out, CPU 실행 대기와 I/O 대기를 확인한다. 프로세스 명령행·환경변수·인증정보는 출력하지 않는다.

```bash
date -Is
free -h
vmstat 1 10
ps -eo pid,ppid,stat,etime,%cpu,%mem,rss,comm --sort=-rss | head -20
```

### 추가 개선이 필요할 때 요청할 설정 작업

- `Jenkinsfile`, `infra/ci/classify_changes.py`, `plan_changes.py`: 순수 설명 문서·게임별 변경·공통 계약·맵·lockfile·미분류 변경을 구분하는 검사 선택 정책을 설계한다. 게임별 import 의존 관계와 비코드 입력을 함께 고려하고, 판정 불가·기준 오류는 넓은 회귀로 전환한다. 새 FE 커밋으로 실제 timeout이 해소되는지 먼저 확인한 뒤 범위를 결정한다.
- `frontend/vitest.config.ts` 등 실행 설정: worker 제한이 필요하면 CI 실측으로 결정한다. 로컬 `maxWorkers=2`를 그대로 CI 기본값으로 복사하거나 전역 격리를 해제하지 않는다. 모든 실행 모드에서 사용자 지침의 전수 탐색·자전거·킥보드 주행 제외를 유지한다.
- 검증 상태 기록: 선택 검증과 전체 회귀 통과를 구분한다. 실패한 실행이나 일부 파일 성공을 전체 `tested.sha` 통과로 기록하지 않는다.
- 중단된 BE 실행의 XML 집계: 기존 로그의 현재 실행 1개 실패와 XML 요약 25개 실패 불일치를 조사한다. 현재 실행에서 생성된 결과인지 식별하고, 오래된 XML이 섞였는지 확인한다. 이번 최신 완료 BE는 0 failures다.

완료 조건은 해당 수정 SHA의 Jenkins 성공, 실제 검사 목록·skip 사유 확인, BE/FE 및 필요한 배포 완료, 전체 60분 제한 안의 소요 시간 기록이다. 실제 서버 권한이 없으므로 이번 FE 작업에서 CI/CD·서버 설정 변경이나 적용 후 Jenkins 성공은 확인하지 않았다.
