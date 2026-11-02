# 알까기 물리 구조 분석

2026-10-31 · 기준선 `35a4f753` · 로컬 시험 범위. 원작 엔진/수치 복원 보고서가 아니다.

## 실제 호출 경로

| 단계 | 실제 파일·진입점 |
| --- | --- |
| 입력·선택·조준 | `frontend/src/alkkagi-preview/main.tsx`의 `Scene` pointerdown/move/up |
| 드래그 정규화 | `frontend/src/game/alkkagi/aimInput.ts`의 `draggedShot`: 거리/2.5, 화면12px·판.08 이하 차단 |
| 로컬 소켓·스레드 | `backend/src/test/java/com/ssafy/ontop/demo/AlkkagiDemoApplication.java`의 `DemoSocket.handleTextMessage/command/step/scheduleSend/send` |
| 월드·알 배치 | `backend/src/main/java/com/ssafy/ontop/game/alkkagi/domain/AlkkagiMatch.java` 생성자·`add` |
| 충돌체·질량 | 같은 클래스 `collisionBody`: 원 fixture, 밀도=m/(πr²), `setMass(FIXED_ANGULAR_VELOCITY)` |
| 승인·발사 | `AlkkagiMatch.shoot`: 권한·actionId·gameId·version·차례·서버 마감·숫자 검사 후 충격량 |
| 물리 진행 | `advance`: 감속→`world.step(1)`→탈락→안정화→`resolve/nextTurn` |
| 공개 데이터 | `snapshot`: 좌표·속도·반지름·질량·생존·단계·시각 |
| 재생 | `frontend/src/game/alkkagi/replay.ts`의 `AlkkagiReplay.push/sample`: 수신시각 기준100ms 보간 |
| 화면 좌표 | `Scene.useFrame`: 서버XY→Three.js XZ, 1단위=1단위; 로컬 위치 예측/외삽 없음 |

게임 세션·아이템·정산의 정식 연결은 아직 없고, 이번 변경으로 완료했다고 표시하지 않는다. 기존 공원 물리/다른 게임은 변경하지 않았다.

## 기준선 수식과 원인

기준선은 질량 `.8/3.2/19.2`, 최대 충격량12, `J=12p(m/.8)`이므로 `v=15p`였다. 같은 당김에 속도는 같아도 운동량·에너지는 질량에 비례한다. 최대힘 왕의 에너지2160, 졸90으로 **24배 차이**다.

일정 감속30에서 무충돌 거리 `D≈v²/(2a)`는 p²에 비례한다. p=.25/.5/.75/1의 실제120Hz 거리 .21875/.90625/2.0625/3.6875칸이다. “당김은 선형인데 중간부터 급격히 멀어지는” 구조적 이유다.

정지 표적과 정면 충돌할 때 이상화한 표적 속도는 `(1+e)m1/(m1+m2)·v1`이다. e=.9, 왕/졸24에서는 졸을 왕 초기속도의 약1.824배까지 보낼 수 있다. 실제 근접 검사에서도 왕→졸 최고속도 약25.99칸/s, 표적11.37칸(경계 없는 격리 세계)이 나왔다. 감속만 높이는 방식은 이런 에너지 차이를 제거하지 못한다.

## 엔진 동작 확인

Context7은 dyn4j 자체 문서를 찾지 못해, 설치된 **6.0.0 JAR의 javap**와 [공식 문서](https://dyn4j.org/pages/advanced.html), [6.0.0 API 색인](https://javadoc.io/static/org.dyn4j/dyn4j/6.0.0/index-all.html)을 대조했다. 다른 엔진 예제를 근거로 사용하지 않았다.

- 모든 계측 body의 실제 질량을 설정값과 오차1e-9 이내로 검사했다. `.8` body inverseMass≈1.25, inverseInertia=0, MassType은 FIXED_ANGULAR_VELOCITY다. 선형 이동이 고정되는 옵션이 아니다.
- 설치 JAR의 `applyImpulse(Vector2)`는 속도에 `J·inverseMass`를 즉시 더하고 body를 깨운다. 힘 accumulator와 혼동하지 않는다. 따라서 현재 감속→step 순서는 발사 첫 스텝에도 적용된다.
- 기본 contact restitutionVelocity=1.0이므로 저속 충돌에서는 e=.9/.55라는 숫자만으로 반동을 단정할 수 없다. 접촉 마찰.15는 알끼리 접선 반응이며, 중력0/바닥 fixture 없음에서 바닥 감속을 대신하지 않는다.
- 기준선의 자동 정지 임계값은 선형.01, 각속도약.0349, 유지.5초다. 수동 .025/24스텝과 기준이 둘이지만 대표 비껴맞기에서 sleep만 끈 결과는 동일했다. 이를 튐의 원인으로 확정하지 않는다. 새 모델은 경기 수동 정지만 사용한다.
- NORMAL 회전을 켜는 실험에서 비껴맞기 표적 이동은 약10.36→10.19칸이었다. 회전 고정만으로 과도한 이동을 설명하지 못했다. 단, 원형 충돌은 팔각형 모서리 걸림/회전 손맛을 재현하지 못한다.
- 최대 스텝 이동은 대표 비껴맞기에서약.21로 maximumTranslation2보다 작았다. 이 사례에서 상한이 속도를 잘라 문제를 만든 근거는 없다.
- 기본 CCD 모드는 ALL, bullet=true다. CCD를 끈 비껴맞기는 최종 결과가 조금 달랐다. 고속 관통 방지를 유지하며, 끈 상태를 개선안으로 채택하지 않는다. 모든 각도에서 CCD 무결성을 증명했다는 뜻은 아니다.
- 감속을 step 뒤로 옮긴 probe는 비껴맞기 표적약10.36→10.72칸으로 달라졌다. 시간 적분 순서에 따른 차이는 있지만 핵심 에너지 문제를 해결하지 못한다. 기존 순서는 유지했다.

`AlkkagiModelStudyTests`는 접촉 preSolve/postSolve의 양쪽 질량·속도·법선·법선 상대속도·법선 충격량을 기록한다. 이는 callback이 제공한 접촉 표본이며 모든 CCD 내부 반복의 완전한 타임라인이라고 주장하지 않는다.

## 물리와 화면 문제 구분

충돌 후 실제 서버 속도 증가와 왕의 높은 에너지는 서버 모델의 문제다. 반면20Hz 좌표 사이 직선 보간은 실제120Hz의 굽은 경로/충돌 순간을 생략하고,100ms 버퍼는 의도적으로 늦게 보여준다. 시뮬레이션 속도와 화면 위치의 차분 속도를 같은 시각의 값처럼 비교하면 안 된다.

현재 카메라는 거의 수직이고 서버XY→화면XZ를 같은 비율로 쓴다. React가 메시지마다 좌표를 초기화하거나 프론트가 충돌을 이중 계산하는 경로는 찾지 못했다. 수신시각을 보간 축으로 쓰므로 지터가 있으면 화면 속도가 달라질 수 있다. 실제 네트워크 지터/GPU 프레임은 이번 합성 비교만으로 해결했다고 할 수 없다.

추가 실제 로컬 관측에서 원래 fixed-delay 송신은25개 STATE/24간격이1494.2ms(평균62.26ms)였다. 고정주기 송신 타이머로만 바꾼 실험도1446.3ms와 seq 누락이 남아 채택하지 않았다. 최종은 physics6스텝 발행 후 별도 sender를 깨우고, CAS로 활성/예약 작업을 유한하게 유지한다. 송신이 느리면 최신 상태만 교체한다. 최종 같은25개 관측은1200.1ms/평균50.00ms, seq 간격 모두1이었다. 이는 짧은 로컬 관측이며 운영 지연 개선률이 아니다. 타이머 해상도 등 모든 원인을 개별 확정한 것은 아니지만 독립 타이머를 제거한 경로의 동작 차이는 확인했다.

물리 예외 catch도 오류를 저장한 뒤 송신을 깨운다. 별도 타이머가 없어도 idle 송신기에서 SIMULATION_FAILURE가 전달되는 실패 주입 테스트를 추가했다.

측정 결과와 한계는 [비교표](alkkagi-physics-comparison.md), 선택한 구조는 [설계](alkkagi-physics-design.md)를 따른다.
