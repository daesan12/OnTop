# 새 공원 지형 사전 생성

기준: `origin/dev@eab25454ef361ab2ff12e8c20f1ac8f47a0ac4f3`, 작업 브랜치 `perf/park-static-prebuild`.

`vite.renewal.config.ts`를 상속하는 배포 빌드는 `renewalStaticPlugin`으로 원본 생성기를 Node에서 실행한다. 높이 필드(Float64), 식생 분류 필드(Float32), 잔디·포장·옹벽 메시, 지면 공간 인덱스, 경계석, 난간 경로·충돌 구간·기둥 및 최종 렌더 메시를 압축 바이너리로 묶는다. 좌표, 경사·경계 계산식, 재질, 충돌·이동 규칙과 서버 판정은 변경하지 않는다.

2차 최적화는 두더지 상점의 정적 몸체·지붕·벽을 같은 파일에 포함한다. 1차 적용 후 Chrome 프로필에서 `buildMoleShop`의 곡면 교차 검사·형상 생성이 첫 화면 전에 약 4.7초를 차지했다. `moleShopArt.ts`가 기존 승인 생성기에 동일한 10×7×6.4m 인자를 전달해 생성하고, `Buildings.tsx`는 설치된 형상을 재사용한다. 승인 패키지 원문, 위치·스케일·재질, 간판 그리기, `VerticalMoleAttract`의 망치·두더지 연출은 유지한다. 새 형상은 기존 무손실 코덱·독립 버퍼·참조 캐시·별도 빌드 프로세스를 그대로 이용한다.

건물 데이터가 없는 이전 형식도 사용할 수 있도록 `buildingArt`는 선택 필드다. 파일 다운로드/복원 실패 또는 건물 데이터 누락 시 원본 생성기를 사용한다. `park-static-mole-ready`, `park-procedural-mole-start/ready` mark로 경로를 구분한다. 2차 전후 로딩 측정과 최종 배포 빌드·브라우저 검증은 MR !495에 기록한다. 개발 진입점은 `pnpm dev:park-renewal:play`의 `http://127.0.0.1:5390/park`이며, 배포 빌드 성능 검증에는 정적 서버와 동일한 모의 HTTP/WS 상태를 사용한다.

3차 최적화는 고정 반사광의 PMREM 계산을 접속 경로에서 제거한다. 2차 적용 후 WebGL 호출 계측에서 첫 접속의 `getProgramInfoLog` 동기 대기가 약 3초였고, 그중 약 1.6초는 PMREM의 GGX 필터 생성 경로였다. 원본 `outdoorReflection()`과 뽑기 기계의 독립된 sRGB 반사광을 설치된 Three의 PMREMGenerator로 각각 처리해 RGBA HalfFloat 결과를 저장한다. 공통 반사광은 336×256(688,128바이트), 뽑기 반사광은 336×128(344,064바이트)이며 두 광원을 섞지 않는다. 새 공원 bootstrap이 사전 파일의 픽셀을 설치한 뒤 재질을 import하며, CubeUV 데이터 텍스처로 복원하므로 같은 반사광을 다시 필터링하지 않는다. 재질·금속성·거칠기·색공간·필터·방향·조명·해상도 및 모든 지형/이동/충돌 데이터는 유지한다. 공통 모듈 변경은 사전 데이터가 설치된 경우에만 적용하며 개발/HMR·기존 맵·이전 파일·실패 경로는 기존 원본을 쓴다.

`static/baked/outdoor-reflection.json`과 `gacha-reflection.json`은 GPU 캡처 픽셀과 원본/생성기/데이터 해시, 원본 색공간·크기·형식·필터·방향, 정확한 Three 패키지 버전을 보관하는 버전 관리 에셋이다. 원본 데이터 또는 Three 구현이 달라지면 CI의 Node 검사에서 빌드가 실패한다. 정상 CI 빌드는 브라우저나 GPU가 필요 없다. 재생성에만 설치된 Chrome/WebGL을 사용하는 `node scripts/bake-outdoor-reflection.mjs`를 실행한다. `--check`는 저장 파일을 바꾸지 않고 현재 GPU의 원본 결과와 비교한다. 캡처 과정에서 HalfFloat 재업로드·readback 비트 일치도 확인한다. GPU별 원본 계산의 반올림 차이가 있을 수 있으므로 실제 헤드셋 검증과 구분한다. 배포 전후 성능·화면 검증은 MR !495에 기록한다.

바이너리는 매 빌드의 별도 Node 프로세스 안에서 새 SSR 모듈 그래프로 생성하고 콘텐츠 해시가 붙은 `/assets/renewal-static.bin-*.gz`로 내보낸다. 부모는 자식 프로세스의 종료까지 기다린 뒤 압축 결과만 읽는다. SSR 모듈 그래프와 형상 CPU 버퍼는 프로세스 종료 시 회수된다. 생성 실패는 빌드를 실패시키며 성공·실패 모두 전용 임시 파일과 디렉터리를 정리한다. 저장소에 생성 파일을 커밋하거나 이전 작업 위치의 파일을 재사용하지 않는다. 높이의 Float64 정밀도 및 메시의 원래 속성·인덱스·bounds·공유 참조를 보존한다. 기존 `/assets`의 immutable 캐시 정책을 그대로 사용한다.

빌드 플러그인은 서비스/미리보기 entry만 얇은 로더로 감싼다. 압축 해제·복원·설치가 끝난 뒤 원래 entry를 import하므로 로그인 페이지의 정적 의존성이 먼저 생성기를 실행할 수 없다. HTTP·압축·형식 오류나 15초 다운로드 제한에 도달하면 기존 생성기로 돌아간다. 이 경우 맵은 유지되지만 첫 로딩이 다시 느려질 수 있다. `park-static-ready`와 `park-static-fallback` performance mark로 구분한다.

개발 서버/HMR, 좌표·백엔드 export, 일반 서비스 빌드는 원본 생성 경로를 유지한다. 새 공원 release/active/integration 빌드는 같은 플러그인을 상속한다. DB/Flyway, 인증·통신 계약, 게임 규칙 및 배포 승인 절차는 변경하지 않는다. 원본 소스 해시가 바뀌므로 기존 FE/BE 맵 identity 생성 및 동시 배포 절차는 그대로 따라야 한다.

검증 명령:

```sh
pnpm exec vitest run tests/unit/renewalStatic.test.ts --maxWorkers=1 --mode park-renewal-release
pnpm exec vitest run tests/unit/renewalStatic.test.ts tests/unit/jumpGimmicks.test.ts --maxWorkers=1 --mode park-renewal-release --no-isolate
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

코드리뷰 후 복원·빌드 메모리 보완:

- TypedArray 정렬은 물리 주소가 아닌 ArrayBuffer 내부의 `byteOffset` 기준이다. 기존 인코더의 8바이트 정렬은 압축 해제나 네트워크 청크 분할로 바뀌지 않는다. 디코더에서도 배열 타입·정수 길이·범위·원소 크기별 정렬을 명시적으로 검사한다. 손상 파일은 기존 fallback으로 복구한다.
- 각 배열은 `buffer.slice(start,end)`의 독립 버퍼로 복원해 압축 해제한 전체 42,428,792바이트를 계속 참조하지 않는다. 같은 배열/형상에 대한 참조 캐시는 유지한다. 복원 중에는 입력과 복사본이 일시적으로 함께 존재하며, 즉시 GC나 모든 기기의 최대 메모리 감소를 보장하는 변경은 아니다. 포맷과 압축 결과는 바뀌지 않는다.
- `BufferGeometry.dispose()`는 GPU 자원 해제 이벤트이며, WebGLRenderer가 없는 Node 생성기의 CPU 배열이나 모듈 캐시 참조를 끊지 않는다. `bake-renewal-static.mjs`를 별도 프로세스로 실행해 빌드 부모 힙과 수명을 분리했다. 단일 생성기의 최대 메모리 자체를 없애는 최적화는 아니다.
- Windows / Node 24.18.0에서 실제 생성 성공과 잘못된 작업 경로 실패를 확인했다. 생성 프로세스 최대 RSS는 573,198,336바이트(약 547MiB), 부모의 GC 후 JS 힙은 8,846,928 → 9,069,416바이트였다. 부모 RSS는 74,035,200 → 83,611,648바이트이며 압축 결과 약 10MB만 전달됐다. 양쪽 종료 경로에서 신규 임시 디렉터리 잔여 0개였다. 컨테이너별 메모리 제한은 별도 확인이 필요하다.
- 복원 관련 4개 테스트가 통과했다. 전체 원본 비트·높이·이동·충돌 비교 외에 Float32/Float64/Uint16/Uint32의 독립 버퍼와 공유 참조, 잘못된 정렬·음수 오프셋·소수/과대 길이·미지원 타입, 1/7/31바이트 경계로 분할한 gzip 스트림을 검증한다.
- 2차 변경에서는 복원 5개와 기믹 회귀 10개, 총 15개 테스트가 통과했다. 상점의 모든 몸체·지붕·벽 속성·노멀·인덱스·bounds를 포함한 전체 비트 비교, 설치된 형상 재사용, 건물 데이터가 없는 이전 파일의 원본 복구, 망치 수직 타격 및 기존 점프 기믹을 검증한다.
- 3차 변경에서는 반사광·복원·GPU 준비 회귀를 검증한다. 저장 데이터 손상 거부, 데이터 없는 경로의 원본 유지, HalfFloat/색공간/필터/방향 보존, 독립된 두 반사광의 원자적 설치, 전체 맵 비트·높이·이동·충돌, 셰이더 대기·실패·컨텍스트 유실·취소를 확인한다. 소스·테스트·저작 도구 typecheck 및 Chrome GPU 캡처 재생성·재업로드 비트 일치를 검사한다.
