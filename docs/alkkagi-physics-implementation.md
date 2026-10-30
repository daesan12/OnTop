# 알까기 구조 개선 변경 요약

2026-10-31 · 로컬 실험 모델 `separated-v1` · **사용자 손맛 검수 대기**.

## 변경 파일과 이유

- `backend/.../game/alkkagi/domain/AlkkagiPhysics.java`: 알 프로필·입력 응답·종류별 속도·충격량 변환을 별도 객체로 분리.
- `AlkkagiMatch.java`: 배치는 프로필에서 읽고 승인된 입력을 목표속도→충격량으로 변환. 정지 판단을 수동 기준으로 통일. SHOT 요청 필드·권한·중복·turn·탈락 흐름 유지.
- `AlkkagiSettings.java`: 자유발사 거리 목표와 결합한 감속18, 충돌 반발.55의 실험 기본값. 엔진 교체 없음.
- `backend/src/test/java/.../AlkkagiModelStudyTests.java`: 동등조건 기준선/후보행렬·접촉 로그·32개 경기 일치·재현성·엔진 옵션 probe.
- `AlkkagiMatchTests.java`, `AlkkagiSocketTests.java`: 실제 새 프로필·상한·공개 데이터·기존 권한/중복/턴/복구 회귀.
- 테스트 전용 `AlkkagiDemoApplication`: 운영 JAR에 넣지 않는 로컬 조절 통신. 독립 송신 타이머 대신 발행 기반 유한 sender로 전송하며 오류도 송신을 깨운다. 기존 TUNE/SHOT 요청 유지.
- `frontend/src/game/alkkagi/aimInput.ts`, `src/alkkagi-preview/main.tsx`: 서버 응답곡선/속도상한에 맞춘 조준 화살표와 입력%·예상속도. 첫 클릭 선택·별도 드래그·오발 차단 유지.
- `frontend/src/game/alkkagi/replay.ts`: 지연을 비교할 수 있는 선택 인자만 추가. 화면 기본100ms·20Hz·외삽 없음 유지.
- `frontend/tools/measure-alkkagi-replay.mjs`: 실제 Java 궤적과 재생 클래스로 같은 경로를 재생 비교. 새 의존성 없음, 프로젝트 Node24 사용.
- 관련 frontend 단위/Chrome 테스트: 응답곡선·재생지연·새모델상태·조준·양화면 동기화·복원 확인.

## 검증 범위

BE31개(알까기 물리/계측/실제소켓과 기존 GameEngineRouter·GameEngineProfile·TableProfile) 및 bootJar를 먼저 통과했고, 송신 후속 보완에서는 새 실패 주입1개를 포함한 소켓3개를 재검증했다(고유 BE총32개). FE타입·알까기 단위8개, 실제Chrome3개(두 화면/조절 복원/탈락·관전복구)도 통과했다. 전체 DB/운영 통합 테스트와 구분한다. 8후보296개 측정행은 별도 테스트296개라는 뜻이 아니다. 구체 결과와 원시표는 [비교 문서](alkkagi-physics-comparison.md)를 따른다.

기존 공원 이동·회원 인증·DB 스키마·기존 게임들의 비즈니스 로직은 변경하지 않았다. 알까기는 아직 정식 GameEngine/아이템/정산 통합 전이다. 새로 정식 API 완료 상태를 만들지 않는다. 푸시·MR·배포는 별도 요청 전 실행하지 않는다.

## 직접 검수

로컬 BE19183/화면5206에서 홍팀 화면을 새로고침하고 ‘기본값으로 새 판’→‘테스트 시작’을 누른다. 접속 상태가 `separated-v1`, 기본값12/18/.55인지 확인한다. 첫 클릭은 선택, 같은 알을 다시 눌러 당긴 뒤 놓으면 발사한다. 청팀 화면은 같은 판을 보고 다음 차례를 조작한다.

다음 순서로 같은 알을 .25/.5/1 정도 당겨보고 비교한다: 가까운 미세 이동→왕의 약한 발사→왕/졸 충돌→비스듬한 타격→여러 알 연쇄→판 밖 탈락. 조준의 예상 출발속도는 충돌 후 이동거리 예측이 아니다.

아직 확인할 것: 사용자가 느끼는 정밀함·왕/졸 밸런스·경기 템포, 실 네트워크 지터/브라우저 프레임, 원형 충돌과 팔각형 시각의 차이, 아이템 추가 후 질량/속도 정책이다. 자동 검사 통과를 손맛 개선 완료나 원작 재현으로 표시하지 않는다.

[구조 분석](alkkagi-physics-analysis.md) · [설계](alkkagi-physics-design.md) · [비교 결과](alkkagi-physics-comparison.md)
