# 새 공원 지형 사전 생성

기준: `origin/dev@eab25454ef361ab2ff12e8c20f1ac8f47a0ac4f3`, 작업 브랜치 `perf/park-static-prebuild`.

`vite.renewal.config.ts`를 상속하는 배포 빌드는 `renewalStaticPlugin`으로 원본 생성기를 Node에서 실행한다. 높이 필드(Float64), 식생 분류 필드(Float32), 잔디·포장·옹벽 메시, 지면 공간 인덱스, 경계석, 난간 경로·충돌 구간·기둥 및 최종 렌더 메시를 압축 바이너리로 묶는다. 좌표, 경사·경계 계산식, 재질, 충돌·이동 규칙과 서버 판정은 변경하지 않는다.

바이너리는 매 빌드의 새 SSR 모듈 그래프에서 생성하고 콘텐츠 해시가 붙은 `/assets/renewal-static.bin-*.gz`로 내보낸다. 저장소에 생성 파일을 커밋하거나 이전 작업 위치의 파일을 재사용하지 않는다. 높이의 Float64 정밀도 및 메시의 원래 속성·인덱스·bounds·공유 버퍼를 보존한다. 기존 `/assets`의 immutable 캐시 정책을 그대로 사용한다.

빌드 플러그인은 서비스/미리보기 entry만 얇은 로더로 감싼다. 압축 해제·복원·설치가 끝난 뒤 원래 entry를 import하므로 로그인 페이지의 정적 의존성이 먼저 생성기를 실행할 수 없다. HTTP·압축·형식 오류나 15초 다운로드 제한에 도달하면 기존 생성기로 돌아간다. 이 경우 맵은 유지되지만 첫 로딩이 다시 느려질 수 있다. `park-static-ready`와 `park-static-fallback` performance mark로 구분한다.

개발 서버/HMR, 좌표·백엔드 export, 일반 서비스 빌드는 원본 생성 경로를 유지한다. 새 공원 release/active/integration 빌드는 같은 플러그인을 상속한다. DB/Flyway, 인증·통신 계약, 게임 규칙 및 배포 승인 절차는 변경하지 않는다. 원본 소스 해시가 바뀌므로 기존 FE/BE 맵 identity 생성 및 동시 배포 절차는 그대로 따라야 한다.

검증 명령:

```sh
pnpm exec vitest run tests/unit/renewalStatic.test.ts --maxWorkers=1 --mode park-renewal-release
pnpm exec vitest run tests/unit/wholeRoadGrade.test.ts tests/unit/sixBoundaryFixes.test.ts tests/unit/guardJoinDiagnostic.test.ts tests/unit/parkFinishingRideRevision.test.ts --maxWorkers=1 --no-isolate
pnpm run build:park-renewal:release
```

첫 테스트는 바이너리 압축/복원 전후의 전체 버퍼를 비교하고, 134개 도로의 중앙·양쪽 가장자리와 난간 기둥의 지면 높이, 걷기·자전거·킥보드 통행 및 난간 횡단 판정을 원본과 정확히 비교한다. HTTP·손상 파일의 fallback도 검증한다. 비교 전용 빌드는 `PARK_STATIC_PREBUILD=0`으로 원본 생성 경로를 유지할 수 있다.

브라우저 비교는 배포 빌드, 동일한 Chrome/1440×900, 동일한 모의 HTTP/WS 상태에서 `park-scene-presented`까지 측정한다. fixture 라우팅은 HTTP 캐시를 비활성화하므로 두 번째 측정은 같은 컨텍스트의 새로고침이며, 일반 사용자의 캐시 재방문 수치를 뜻하지 않는다. 실제 인증 서버 연결·헤드셋 성능·운영 네트워크 속도와 구분한다.

2026-11-11 검증 기록:

| 항목 | 수정 전 | 사전 생성 적용 |
| --- | ---: | ---: |
| 첫 진입 → 공원 첫 프레임 | 75.014초 | 26.885초 |
| 같은 컨텍스트 새로고침 → 첫 프레임 | 76.359초 | 18.012초 |
| 첫 진입 최장 메인 스레드 작업 | 51.782초 | 6.885초 |

첫 진입은 약 64%, 새로고침은 약 76% 단축됐다. 사전 생성 파일의 다운로드·압축 해제·복원은 첫 진입에서 약 0.625초였다. 최종 파일은 42,428,792바이트를 10,335,532바이트로 압축했다. 남은 모델·식생 생성·GPU 준비 시간은 별도 최적화 대상이며 이번 수치를 운영 네트워크나 모든 기기의 보장값으로 사용하지 않는다.

소스/테스트 typecheck, 원본과 바이너리의 비트 비교·134개 도로 높이/통행/난간 판정·압축/손상 복구 3개 테스트, 기존 도로·경계석·주행·난간 회귀 31개 테스트를 통과했다. Chrome 전후 화면·캔버스 표시·로딩 해제·키보드 WORLD_MOVE 전송 검증에서 런타임 오류와 실패 HTTP 응답은 없었다. 맵·에셋 원본, 백엔드 코드와 migration은 수정하지 않았다. 최신 dev가 작업 이력에 포함돼 별도 통합 커밋과 충돌 해결은 필요하지 않았다.
