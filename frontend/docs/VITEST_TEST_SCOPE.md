# Vitest 불필요한 검증 내용 정리

테스트 개수를 줄이는 것을 목표로 하지 않는다. assertion에 쓰이지 않는 반복 계산과 같은 계약을 중복 확인하는 내용을 삭제하고, 필요한 기능·진단·소스 보존 검사는 유지한다. Jenkins, Vitest 실행 설정, package script, 의존성 및 제품 코드는 변경하지 않는다.

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

## 검증 기록

- 시작 dev `6a690e05`에서 최신 `fa1516e15ea256e6ad903383dfec6e89b2dfed95`까지 이력을 보존하는 merge로 반영했다. 충돌 없음.
- 최종 관련 테스트 12개 파일: 33 passed, 5 skipped. skipped는 재현 trace 환경변수가 없는 기존 진단이며, 삭제한 전수 탐색의 본문을 실행한 것이 아니다.
- 전체 `src`와 관련 테스트의 타입 검사 통과. 정적 배치 해시 값 보존 및 목적 있는 다섯 테스트의 dev 원문 동등성도 확인했다.
- 기존 전체 테스트 타입 검사에는 수정하지 않은 `tests/e2e/admin-mole-audit.spec.ts:227`의 `window.innerWidth` 오류가 남아 있다. 이번 변경은 해당 파일을 수정하지 않는다.
- 줄넘기 같은 파일의 앞선 로컬 비교는 Node 24.18.0, Vitest 5.0.4, `maxWorkers=1`, `6a690e05` 기준으로 변경 전 11.98초, 변경 후 7.45초였다. 각 1회 측정이며 Jenkins 전체의 단축 시간을 보장하지 않는다.
- 실제 서버 연결과 전체 공원 통합 검증은 수행하지 않았다. CI 실행 조건이나 서버 자원·모듈 로딩 병목은 별도 진단 대상이다.
