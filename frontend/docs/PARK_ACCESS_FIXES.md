# 최신 공원 보행·시설 보정

기준은 `origin/dev@7c06946331386f76dd4bec3d6ea048eaa14f10bc`를 포함한 `perf/park-static-prebuild`다. 최적화와 별도로 사용자에게 보고된 최신 맵의 보행·시설 연결을 수정한다. 승인 에셋, 지형/식생 배치, 서버 위치 검증의 허용 폭, 게임·정산 규칙은 변경하지 않는다. 새 DB migration이나 DB 적용은 없다.

- 운동마당의 기존 `backmassage` ID는 화면에서 이미 거꾸로 매달리기 2로 교체되어 있었다. 새 공원 조작 설정도 같은 `DRAFT_FITNESS_STATIONS`를 사용해 이름·기구 종류·탑승 기준 높이·기울기 애니메이션을 맞춘다. 영속 facility ID와 서버의 명시적 use/exit 좌표는 유지한다.
- 새 맵 비둘기는 방문자가 빈 배열로 연결되어 있었고, 작은 3.9m 생성 격자는 기존 5–12m 도피 거리 조건도 대부분 만족하지 못했다. 초기 새 위치는 유지하면서 도피 착지점을 확보하고, 화면에 표시되는 실제 방문자 위치의 프레임별 속도를 샘플링한다. 달리기·접근 방향·높이·활동 중 여부와 기존 겁주기 속도 조건은 유지한다. 떠난 방문자는 샘플 캐시에서 제거한다.
- 기존 서버 handoff는 물 영역을 항상 바닥으로 바꾸고 1m 높이 격자에 건물/계단을 섞었다. 아치 다리의 정확한 상판, 접속부, 팔각정·대석탑의 평탄면과 계단 경사면, 40m 전망대의 세 바퀴 경사로/정상층을 독립된 지지 메시로 내보낸다. 단일 높이 격자가 서로 다른 층을 대체하거나 다리 진입부에 가짜 높은 경사를 만들지 않도록 구조물 아래로 내린다.
- 보이는 계단 메시·디자인은 그대로 두고 캡슐 지지는 연속 경사면으로 처리한다. `accessSurfaces.ts`의 동일한 경계·높이가 로컬 예측과 서버 내보내기에 사용된다. 메인 팔각정은 GLB에서 측정한 지면 최저점(-.015m), 윗바닥(2.6m), 팔각형(R=9.52m), 네 방향 실제 계단 폭/길이를 반영한다. 검수된 기구/벤치/테이블의 use·exit·좌석 좌표와 coordinate hash는 유지한다. 원본 에셋과의 최대 15mm 높이 차이는 기존 접촉 여유 안에서 검증한다. 다리는 캡슐이 경사 앞쪽에 닿는 접선 여유 높이를 로컬 원점에 반영한다. 서버의 충돌 허용 폭을 키우지 않는다.
- 팔각정 기둥·난간과 테이블/보이는 의자의 충돌체를 로컬 이동과 서버에 함께 연결한다. 둥근 서브 팔각정 테이블은 원형/32각형 몸체를 쓰고, 실제 야외 돌벤치·옆 의자 치수를 사용하고 서버가 공개한 2/4인 의자 수를 로컬 예측에도 적용해 보이지 않는 추가 의자는 막지 않는다. 모든 기존 퇴장 좌표에서 지지와 충돌 여유를 실제 서버 물리로 검증한다. 기존 서비스의 가구 오르기 금지 높이 정책을 재사용한다. 높은 석단 옆면을 자동 계단으로 취급해 원점을 순간 이동시키지 않는다. 석단 몸체는 지면부터 채워 밑으로 통과할 수 없게 한다.

관련 경로는 `src/park-renewal/{accessSurfaces,solidCollision,walkSupportExport,surfaceHeight,travelMotion}.ts`, `mapping/{catalog,backendExport}.ts`, `src/park/mapConfig.ts`, 새 맵 비둘기 연결과 공통 방문자 샘플러다. `backend/src/test/.../RenewalAccessTests.java`는 실제 Bullet 장면과 기존 `ClientPositionValidator`로 다리 양방향, 전망대 3회전 왕복, 팔각정/석탑/장거리 계단 왕복을 승인하고 기둥/난간/탁자 내부의 이동은 거부하는지 검사한다. 기존 출발 40명/외곽 충돌 회귀도 함께 검사한다.

독립 실행은 `pnpm dev:park-renewal:play`(기본 127.0.0.1:5390/park)와 기존 Playwright HTTP/WS fixture를 사용한다. 이번 검증은 다른 작업의 포트를 보존하기 위해 127.0.0.1:5490/park를 사용한다. 브라우저의 위치 주입은 검수 장소 이동용이며 E 이용·이동으로 종료·실제 방문자 속도에 대한 비둘기 비행은 앱 런타임을 따른다. 서버 승인 여부는 모의 서버와 구분해 실제 Bullet/위치 검증기 테스트로 확인한다.

대표 검증 명령:

```sh
pnpm exec vitest run tests/unit/renewalAccess.test.ts tests/unit/renewalPrediction.test.ts tests/unit/renewalRuntime.test.ts --maxWorkers=1 --mode park-renewal-release --no-isolate
pnpm exec vitest run tests/unit/pigeonHabitat.test.ts tests/unit/sharedBuildingModels.test.ts --maxWorkers=1 --mode park-renewal-release --no-isolate
./gradlew test --tests '*RenewalAccessTests' --tests '*RenewalSpawnTests' --tests '*RenewalPerimeterTests'
```

최종 export·package·release 빌드 후 FE/BE 맵 identity를 같이 반영해야 한다. 이번 작업에서 운영 서버·실제 인증/정산·헤드셋·Jenkins candidate 배포를 실행한 것으로 간주하지 않는다. 별도 승인 없이 dev/master에 머지하거나 배포하지 않는다. 최종 브라우저/빌드/로딩 비교 결과는 MR !495에 기록한다.
