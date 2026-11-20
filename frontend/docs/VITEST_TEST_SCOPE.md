# Vitest 기본 회귀와 로컬 검토 범위

기본 회귀는 `tests/unit/**/*.test.ts`, 별도 로컬 검토는 `tests/local-unit/**/*.test.ts`를 사용한다. `vitest.config.ts`, `vitest.local.config.ts`, package script와 Jenkins 설정은 이번 정리에서 변경하지 않았다. 기본 회귀의 일반 기능 검사를 유지하면서 수동 진단과 소스 보존 검토를 구분한다.

## 기본 회귀에서 유지하는 검사

- 인증·재접속·입력 소유권·게임 규칙·결과 복구·지갑·바인딩·FE/BE 맵 계약을 유지한다.
- `worldMapParity.test.ts`에 기존 legacy schema version 검사를 모았다.
- `frontendTestLayout.test.ts`에 frontend-test 바인딩과 정본의 동등성 검사를 모았다. 기존 dev 바인딩 검사와 함께 `legacyCollisionVersion.test.ts`의 계약을 보존한다.
- `movementAblation.test.ts`의 순수 품질 집계 및 freshness·relocation 경계 검사 두 개는 기본 회귀에 남긴다.
- 맵 watcher 및 실제 에셋 welding 검사는 유지한다. 관련 변경만 실행하는 CI 연결은 별도 인프라 작업으로 다룬다.

## 실행하지 않는 전수 검사

사용자 지침에 따라 아래 테스트는 코드를 보존하고 `it.skip`으로 실행을 제외한다. 전체 테스트 실행에서도 이 정책을 유지하며 자전거·킥보드 주행 검사를 추가하거나 실행하지 않는다.

| 파일 | 제외 부분 | 유지 부분 |
| --- | --- | --- |
| `generatedServiceMap.test.ts` | 모든 목적지의 접근 경로 순회 | 생성 맵 identity·바인딩·상호작용 좌표 및 개별 횡단 계약 |
| `navigation.test.ts` | 모든 목적지의 접근 경로 순회 | 입력 소유권·잘못된 좌표·개별 경로 계약 |
| `layoutJump.test.ts` | controller로 113개 표면 전체 순회 | 게임 시작·보상·실패·게이트 순서·입력 버퍼 |
| `parkCheckpoint.test.ts` | 19,881개 이동·높이·수영 샘플 | 기존 정적 배치 데이터 checkpoint |

제외 지침이 명시적으로 변경되지 않는 한 이 검사들의 skip을 해제하지 않는다.

## 필요할 때 실행하는 로컬 검토

다음 검사는 `tests/local-unit/`으로 옮겼다. 파일 깊이가 같아 기존 fixture·src import 경로를 유지한다.

`movementComparison`, `unifiedMovementRegions`를 호출하는 기존 BE 진단과 `movementQuality`의 문서화된 CLI 경로를 위해 `tests/unit/`에는 얇은 호환 진입점을 남긴다. 환경변수가 있을 때만 로컬 진단 모듈을 import하고, 일반 회귀에서는 skip을 등록한다. BE 코드와 기존 명령 경로를 바꾸지 않는다.

| 파일 | 목적과 조건 |
| --- | --- |
| `parkVisualPreservation.test.ts` | 승인 소스 200개의 원문 해시 보존 검토. 기능 회귀나 실제 화면 비교를 뜻하지 않는다 |
| `movementComparison.test.ts` | `MOVEMENT_COMPARISON_DIR`의 실제 Bullet trace와 FE 예측 비교 |
| `movementQuality.test.ts` | `MOVEMENT_COMPARISON_DIR`를 사용하는 보간·예측 품질 측정 |
| `unifiedMovementRegions.test.ts` | `UNIFIED_MOVEMENT_DIR`에 FE/BE 지역별 이동 fixture를 생성하는 진단 |
| `movementAblation.test.ts` | `MOVEMENT_AB_DIR`의 실제 trace를 이용한 ablation 측정 부분만 분리 |

실행 위치는 `frontend/`이다. 환경변수가 필요한 검사는 재현 자료를 준비한 경우에만 해당 파일을 명시적으로 실행한다. 아래는 소스 보존 검토의 예이다.

```bash
pnpm exec vitest run --config vitest.local.config.ts tests/local-unit/parkVisualPreservation.test.ts
```

관련 버그의 재현·원인 분석에 필요한 trace 진단은 이 경로로 계속 사용할 수 있다. 기본 회귀에서 파일이 빠졌다고 검증 완료 또는 진단 불필요를 뜻하지 않는다.

## 줄넘기 시뮬레이션 계산량

`jumpRopeGrandpaHuman.test.ts`는 사람 3종 × seed 300개의 현재 설정 검사와, 실제 assertion에서 쓰는 서툰 사람의 과거 설정 300회를 유지한다. assertion 없이 표 출력에만 사용되던 다른 두 사람의 과거 설정 600회는 제거했다. seed·완주율·피격·회피 직후 MISS·과거 대비 개선 기준은 바꾸지 않았다.

2026-11-20 로컬 Node 24.18.0, Vitest 5.0.4, `--maxWorkers=1`에서 같은 파일의 전체 실행 시간은 변경 전 11.98초, 변경 후 7.45초였다. 각 1회 측정 결과이며 서버·전체 Jenkins의 단축 시간을 보장하지 않는다.

## 이번 변경의 검증 기록

- 기준 dev: `6a690e05a76063c5d6269d3443ecfebb4f902c41`, 작업 시작 시 최신 dev 포함. 통합 충돌 없음.
- 변경한 기본 회귀 7개 파일: 31 passed, 25 skipped. skip은 지침의 전수 검사이며 실행하지 않았다.
- 줄넘기 사람 모델: 변경 전·후 각각 1 passed.
- 분리한 로컬 검토 5개 파일: 소스 보존 검사 1 passed, 외부 trace가 없는 진단 5 skipped. 실제 trace 기반 재현은 미검증이다.
- 기존 CLI 경로의 호환 진입점 3개: 외부 trace 없는 상태에서 4 skipped, 무거운 진단 모듈을 로딩하지 않는다.
- 환경변수를 설정한 `vitest list --no-static-parse`로 기존 CLI 경로에서 진단 4개가 등록되는 것을 확인했다. 이 수집 검증은 진단 본문을 실행하거나 trace 파일을 생성하지 않는다.
- 전체 `src` 및 변경 테스트 16개 파일의 타입 검사 통과.
- 기존 전체 테스트 타입 검사에는 수정하지 않은 `tests/e2e/admin-mole-audit.spec.ts:227`의 `window.innerWidth` 타입 오류가 남아 있다. 해당 파일은 dev와 동일하고 단독 포함 검사에서도 같은 오류가 재현된다. 이번 작업에서는 별도 기능의 E2E 코드를 변경하지 않았다.
- 제품 코드·공통 runtime·맵·BE·migration·의존성·Jenkins 및 Vitest 실행 설정 변경 없음. 실제 서버 연결 및 전체 공원 통합 검증은 수행하지 않았다.
