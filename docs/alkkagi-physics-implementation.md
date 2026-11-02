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

로컬 BE19183/화면5206에서 홍팀 화면을 새로고침하고 ‘기본값으로 새 판’→‘테스트 시작’을 누른다. 접속 상태가 `separated-v1`, 기본값30/60/1인지 확인한다. 첫 클릭은 선택, 같은 알을 다시 눌러 당긴 뒤 놓으면 발사한다. 청팀 화면은 같은 판을 보고 다음 차례를 조작한다.

다음 순서로 같은 알을 .25/.5/1 정도 당겨보고 비교한다: 가까운 미세 이동→왕의 약한 발사→왕/졸 충돌→비스듬한 타격→여러 알 연쇄→판 밖 탈락. 조준의 예상 출발속도는 충돌 후 이동거리 예측이 아니다.

아직 확인할 것: 사용자가 느끼는 정밀함·왕/졸 밸런스·경기 템포, 실 네트워크 지터/브라우저 프레임, 원형 충돌과 팔각형 시각의 차이, 아이템 추가 후 질량/속도 정책이다. 자동 검사 통과를 손맛 개선 완료나 원작 재현으로 표시하지 않는다.

[구조 분석](alkkagi-physics-analysis.md) · [설계](alkkagi-physics-design.md) · [비교 결과](alkkagi-physics-comparison.md)

## 사용자 선택 후속 확정
2026-10-31 실제 플레이 피드백으로 발사 힘30·감속60·반발1을 기본값으로 저장했다. 분리된 물리 구조/질량/응답곡선은 유지한다. 위12/18/.55의 후보 비교표는 당시 실험 이력이며 현재 기본값과 구분한다. 사용자 선택은 선호 확인이며 원작 동등성/모든 밸런스 검수 완료를 뜻하지 않는다. 선택값은 ModelStudy의 user-selected-30-60-1 모델에서 별도로 검증한다.

## 2026-11-02 배포 번들·개발 프로필 연결

서버 `AlkkagiConfiguration`은 명시적으로 켠 `local` 또는 `dev`에서 등록한다.
`prod`/`production`이 섞이면 등록하지 않는다. V137과 종료 정산 연결을 함께 배포하며
`dev` 설정의 `GAME_ALKKAGI_ENABLED` 기본값은 true다. 명시적인 false는 우선한다.
실제 시작에는 기존 `GAME_START_ENABLED=true`와 인증·DB Gateway가 필요하다.
local 및 개발 프로필 외에는 기존 명시적 활성화 조건을 유지한다.

FE는 Vite 개발 서버 여부와 분리해 `VITE_ALKKAGI_ENABLED=true`인 번들에서만
알까기 선택을 노출한다. 따라서 개발용으로 빌드한 정적 파일에서도 선택할 수 있고,
해당 빌드 플래그가 없거나 false이면 계속 숨긴다. 할리갈리 등 기존 게임은 유지한다.

개발 전용 Jenkins 빌드의 두 `build:park` 경로는 위 FE 플래그를 true로 전달한다.
실제 Vercel 원격 재빌드에도 `frontend/vercel.dev.json`으로 같은 플래그를 전달한다.
서버 이미지·V137 적용이 먼저 완료된 뒤 FE를 연결한다. 운영용 빌드는 변경하지 않는다.

V137은 `game_sessions`의 기존 참가 인원 CHECK에 ALKKAGI 2인만 추가한다.
기존 할리갈리 2~4인과 나머지 게임 조건·데이터는 유지한다. 2026-11-02 사용자가
팀 공유와 V136 다음 적용 순서 확인을 완료했다. 기존 SQL 수정·repair·outOfOrder는 하지 않는다.

`VerifiedGameFinish`는 알까기 종료 사유·2인·승자 1명을 검증한다. 동시 탈락/제한시간 동률은
전원 DRAW로 정상 종료하고 예약금을 반환한다. `SIMULATION_INVALID`/`SIMULATION_LIMIT`는
전원 DRAW인 무효 경기로 보존하고 예약금을 반환한다. 기권·연결 유예 만료·로그아웃·탈퇴는
기존 이탈 사유/시각을 보존한다. 저장·정산 서비스의 잠금·중복 방지 방식은 변경하지 않는다.
할리갈리의 카드 수 공동 승리도 유지한다. 게임 입력/상태/복구 JSON 계약은 바뀌지 않는다.

로컬 검증은 엔진 이벤트→종료 검증→저장 서비스의 대역 검사와 기존 정산 회귀를 포함한다.
공용 DB 적용·개발 서버 두 계정 실검수·Jenkins 배포 성공은 MR 생성만으로 완료되지 않는다.
