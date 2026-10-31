# 아이템 알까기 기본 물리·발사 동기화

2026-10-30 · S15P31B105-294 · **로컬 검증 전용, 실제 서비스 계약/배포 완료 아님**.

## 근거와 미확인

- 사용자 제공 `OnTop_아이템알까기_Codex_구현기획서_v1.md`와 추가 확정 규칙을 기준으로 한다.
- [넷마블 공식 게임소개](https://c2.img.netmarble.kr/web/board/game/v/html/poweral/iframe/ifrm_introduce01.html):
  1대1, 알마다 다른 무게, 공격 반대 방향으로 당겨 놓는 조작을 설명한다.
- [공식 인터페이스](https://c2.img.netmarble.kr/web/board/game/v/html/poweral/iframe/ifrm_introduce02.html)의
  게임방 이미지를 직접 확인했다. 車·馬·象·士·漢/楚·包·兵/卒과 크기 차이, 고정 벽 2개가 보인다.
  진행 중인 장면만으로 초기 배치를 확정하지 않았고, 이후 실제 플레이 영상으로 추가 확인했다.
- 저작권 이미지/에셋을 제품에 복사하지 않는다. Geometry·직접 그린 한자 텍스처만 사용한다.
- 실제 영상에서 16개/인·초기 배치·세 크기 그룹을 확인했다. [관찰과 근사 모델](alkkagi-reference-observations.md)을 참고한다.

## 이번 범위

후속으로 비밀 손패·아이템8종을 로컬에 연결했다. 시작 전 연습 카드 지급, 요청/개인 응답, 시간·소모 검증은 [카드 계약](alkkagi-items.md)을 따른다. 로컬 정상 플레이의 실제 카드 지급·관전·기권/복구·결과/다음 판도 연결했으며, 실제 제품/DB 통합 완료는 아니다.

`game/alkkagi/domain/AlkkagiMatch`는 dyn4j 6.0.0으로 기본 발사·원형 충돌·판 밖 탈락을 계산한다.
고정 벽은 없다. 알 모양은 FE의 팔각 기둥이고 충돌체는 원이다.
서버 소유 스레드가 120Hz 고정 스텝을 진행하고, 6스텝마다 최신 전체 스냅샷을 제공한다.
네트워크 전송은 다른 스레드에서 처리해 느린 수신자가 물리 계산을 직접 막지 않는다.
전송이 밀리면 중간 스냅샷을 누적하지 않고 최신 상태로 교체한다.

FE는 100ms 버퍼에서 서버 스냅샷을 보간한다. 충돌·생존을 예측하거나 역전 메시지를 적용하지 않는다.
이미 탈락한 알은 재접속 시 낙하를 재생하지 않고 숨긴다. 진행 중 탈락은 서버 최종 평면 좌표에서만 연출한다.
조준/권한에는 최신 상태를 쓰고 렌더 위치는 React 상태 변경이 직접 덮어쓰지 않는다.

현재 후보는 `AlkkagiPhysics.experimental()`과 `AlkkagiSettings.provisional()`로 분리했다.
알 프로필(반지름/질량/기본최대속도)은 소형 .24/.8/12, 중형 .32/2.4/11, 왕 .43/6.4/10이다.
응답곡선은 f(p)=p(1+.5(1-p)), 출발속도는 종류별상한*(maximumImpulse/12)*f(p), J=mass*출발속도다.
maximumImpulse 로컬 필드는 호환상 이름을 유지하지만 12가 속도배율1이라는 뜻이다.
판9x10, 사용자 선택 기본값 maximumImpulse30(속도배율2.5)/바닥감속60/반발1, 정지.025/24스텝, 자동sleep비활성, CCD/bullet유지다.
모든 새 수치는 사용자 검수용 실험 가설이다. 원작 실측값/완성된 손맛이라는 의미는 아니다.
구조 분석·후보 비교·새 모델의 부작용은 [분석](alkkagi-physics-analysis.md), [설계](alkkagi-physics-design.md),
[동일조건 측정](alkkagi-physics-comparison.md), [변경·검수](alkkagi-physics-implementation.md)를 따른다.
설정 검증 실패는 시작 거절, 수치 이상/최대 시뮬레이션 초과는 검증 종료이며 정상 승리·DB 정산으로 연결하지 않는다.

## 실행과 직접 테스트

기존 서버를 종료할 필요 없다. 새 서버는 `127.0.0.1:19183`, 화면은 `127.0.0.1:5206`이다.

1. backend에서 Java21 환경으로 `./gradlew.bat alkkagiDemo` 실행.
2. frontend에서 기존 pnpm 의존성을 준비한 뒤 `pnpm exec vite --host 127.0.0.1 --port 5206 --strictPort` 실행.
3. `http://127.0.0.1:5206/alkkagi-preview.html?role=red` 접속.
4. ‘청팀 화면 열기’와 ‘관전’으로 동일 판을 다른 창에 연다.
5. 판 위 안내의 ‘테스트 시작’ 클릭. 홍팀 알 위에서 처음 마우스를 누른 채 상대 방향의 반대로 드래그하고 놓는다. 미리 클릭해 선택하는 별도 동작은 필요 없다. 클릭만으로는 발사하지 않는다.
   시작 전·상대 차례는 발사를 막는다. 관전자는 현재 차례의 알을 같은 드래그로 훈수할 수 있으며 실제 알은 움직이지 않는다.
6. 모든 알이 멈춘 뒤 청팀 화면에서 발사한다. 새 판은 홍팀의 ‘새 판’으로 시작 대기 상태로 초기화.
7. Esc/우클릭/포커스 이탈은 조준 취소. 연결 끊김은 조작 차단·자동 재연결 후 최신 판 복구.

로컬 데모의 role 쿼리는 **실제 인증이 아니다**. 테스트 클래스패스에서만 존재하고 운영 JAR에 포함하지 않는다.
설정도 `alkkagi-physics-demo` 전용 프로필에서만 등록해 일반 앱 테스트의 컴포넌트 탐색에 섞이지 않는다.
허용 Origin은 위 로컬 화면 두 주소뿐이며 최대12연결·2KB텍스트·유한 입력/응답 큐를 사용한다.
한 연결당 별도 경기나 알 조작 권한을 만들지 않는다. 두 탭이 같은 역할이어도 같은 상태/버전으로 검증한다.
공통 GameEngine/Router 입력·기권·복구·종료 어댑터는 구현·계약 검증했다. 실제 회원 인증·기존 공원/착석·관전 거리·DB 게임 종류·판돈·정산 활성화는 하지 않았다. 상세 경계는 카드 계약의 기존 게임 인터페이스 절을 따른다.

## 로컬 통신 계약

### 로컬 화면의 물리값 조절

판 위 ‘물리값 조절 · 로컬 전용’을 열면 홍팀 화면에서 슬라이더/숫자로 조절할 수 있다.
발사 힘은 로컬 속도배율 기준값0.5~30, 감속은0.1~60, 반발은0~1이다. 값 변경만으로는 적용되지 않는다.
‘적용하고 새 판’은 현재 판을 버리고 검증된 설정으로 시작 대기 상태를 생성한다.
일반 ‘새 판’은 조절값 유지, ‘기본값으로 새 판’은 서버의 기본값30/60/1으로 복원한다.
서버 재시작 후에도 기본값으로 돌아가며 파일/.env/운영 설정을 저장하거나 변경하지 않는다.
다른 홍팀 탭에서 값을 적용해도 모든 화면의 서버 설정 표시가 갱신된다. 청팀/관전자는 읽기 전용이다.

테스트 전용 `TUNE`은 gameId/expectedVersion/maximumImpulse/deceleration/restitution,
`TUNE_RESET`은 gameId/expectedVersion을 받는다. 둘 다 홍팀만 허용하고 현재 경기/버전이
맞아야 한다. 유효 숫자/허용 범위 확인 후에만 새 경기와 활성 설정을 교체한다.
성공은 `TUNING_APPLIED` 후 새 gameId의 `STATE`로 확인한다.
실패 `RED_TUNING_ONLY`/`STALE_TUNING`/`INVALID_TUNING`은 현재 판과 설정을 유지한다.
진행 중인 발사의 물리 계수를 중간 변경하는 기능은 아니며, 명시적 새 판 생성 기능이다.
기존 게임의 `GAME_ACTION_SEND`나 제품 WebSocket에는 이 메시지를 추가하지 않았다.

WebSocket: `ws://127.0.0.1:19183/dev/alkkagi-ws?role=red|green|viewer`.
이 경로는 제품 API 명세에 완료로 등록하지 않는다.

```json
{
  "type": "SHOT",
  "gameId": "서버가 보낸 경기 ID",
  "actionId": "동일 발사 재확인에 사용하는 UUID",
  "expectedVersion": 1,
  "pieceId": "p11",
  "dx": 0,
  "dy": -1,
  "power": 0.8
}
```

actor·알 좌표·충돌 결과를 입력받지 않는다. 역할은 테스트 연결에서 결정한다.
성공은 `SHOT_ACCEPTED`와 승인 version/actionId, 실패는 `ERROR`/code.
동일 actor/actionId의 같은 요청은 이전 승인 반환, 다른 내용은 `ACTION_ID_CONFLICT`.
수신 순서가 아니라 gameId·version·단계·현재 차례·서버 마감 시각을 함께 검사한다.
종료/턴 전환 후 늦게 도착한 발사를 새 행동으로 반영하지 않는다.

공개 `STATE`는 seq와 state(gameId, version, tick, simulationId, stage, turn, turnNumber,
turnDeadline, matchDeadline, serverNow, winner, endReason, pieces, timeouts, settings, provisional)를 포함한다.
공개 말은 id/owner/type/x/y/vx/vy/radius/mass/alive/launchSpeed다. STATE에는 modelId와 inputCurveBoost도 포함한다. 서버 XY는 화면 XZ로 매핑한다.
공개 상태에는 미사용 손패의 종류/ID를 넣지 않는다. 손패/본인 지급 이정표는 소유자 전용 PRIVATE_STATE에만 포함한다. 실제 로컬 추첨은 서버에서 수행하며 RNG/시드는 전송하지 않는다. 회원 인증은 아직 연결하지 않았다.

## 확정 타이머와 로컬 임시 정책

- 턴30초, 자기 턴2연속 미발사 AFK패, 정상 발사 승인 시 해당 사용자 카운터 초기화.
- 전체12분은 사용자 승인 초기 설정. 물리 중 전체 시간 만료는 현재 발사 종료 후 생존 수 비교.
- 임시 선공은 홍팀 고정. 로컬 연결이 끊겨도 시계는 계속 흐른다. 정식 재접속 유예는 통합 전 미적용.
- 알 중심이 외곽을 넘으면 탈락, 동일 발사 양측 전멸은 무승부로 임시 표시. 최종 정책 아님.
- 한 번의 발사가 모두 정지해야 차례가 바뀐다. 최대 물리 시간 초과는 별도 실패 사유이며 정산하지 않는다.

## 이후 구현

기존 `GameEngineRouter`·`GameStateView`·공통 입력/복구·회원 권한·판돈 예약 및 정산 연결을 재사용한다.
현재 시작/게임 선택/종료 검증에는 기존4게임 분기가 있어 알까기 등록 확장이 필요하다.
카드8종·실제 지급·관전자 커서/채팅/유령샷·기권/복구·결과/다음 판은 로컬에 구현했다. 실제 공원/판돈 통합과 임시 정책 최종 검수는 후속 범위다. 이미지·효과음 요청은 alkkagi-assets.md에 정리했다.
제품 코드·DB·공용 계약 변경은 별도로 맞추고, 신규 마이그레이션은 번호 공유 전 작성/푸시하지 않는다.
미정 규칙은 [별도 목록](alkkagi-decisions.md)에 모았다.

## 검증과 한계

BE `AlkkagiMatchTests`, `AlkkagiSocketTests`, FE `tests/unit/alkkagiReplay.test.ts`가 진입점이다.
발사 권한·유효 수치·동일 요청·정지 후 턴 전환·탈락·마감 경합·AFK·고정스텝 재현·두 소켓 동일
스냅샷·재접속·보간/역순 메시지를 검증한다. 운영 환경/부하/원작 손맛 동등성 검증은 아니다.
측정할 값은 물리 step p95·발사 완료 시간·전송량·화면 간 재생 시차이며 성능 개선치는 아직 없다.

현재 조작: 처음 알을 누른 채 드래그하고 놓으면 바로 발사한다. 클릭·미세 흔들림은 발사하지 않는다. 이전 두 제스처 방식은 사용자 요청으로 제거했다.

2026-10-31 사용자가 실제 조작 후 선택한30/60/1을 기본값으로 저장했다. 프로필/응답곡선은 그대로이고, 실제 기본 최대속도는 소형30/중형27.5/왕25다. 아래 분석·비교 문서의12/18/.55는 이전 후보 측정이며 원시 결과를 덮어쓰지 않는다.

## 로컬 공원 연결 (2026-10-31)

전용 물리 테스트 페이지와 별개로 실제 공원 테이블의 선택→착석→준비→방장 시작→공용 경기 입력/상태→기권/복구→다음 판 경로를 연결한다. `ALKKAGI`는2인 게임이며, 로컬 엔진은 `ontop.games.alkkagi.enabled=true`를 명시한 local에서만 등록한다. DEV/운영 자동 활성화는 하지 않는다. 실제 지갑/DB 예약·정산 구현과 스키마는 변경하지 않았다.

- BE: Java21에서 `./gradlew.bat alkkagiPark` → loopback19184. 테스트 classpath의 AlkkagiParkApplication이 메모리 검수 계정101/202/505·시작/결과 대역을 제공한다. 실제 재화는 변하지 않으며 표시 잔액10,000과 증감0은 검수용 값이다. 회원 검증 대역 뒤의 Access JWT 검사·1회용 웹소켓 티켓·공원 소켓은 기존 경로를 그대로 사용한다. 이 도구와 고정 테스트 서명값은 운영 JAR에 포함되지 않는다.
- FE: `pnpm dev:alkkagi-park` → `http://127.0.0.1:5207/alkkagi-park.html?role=red`. green/viewer 링크는 별도 창으로 연다. 채널A 선택 →1번 탁자 확인 →앉기 →아이템 알까기/판돈 설정 →두 명 준비 →방장이 시작. 로컬 테스트 전용 로그인 진입이며 정식 로그인 변경이 아니다.
- 공원 렌더링: 기존 TableShell의 같은 Canvas 안에 판/알을 배치한다. 별도 전체 게임창/초록 배경/두 번째 게임 Canvas는 없다. 공원 카메라가 실제 테이블을 비스듬히 내려다보고 HUD·손패만 겹친다. 테이블의 위치·회전·배율을 역변환해 포인터를 서버 판 좌표로 계산한다. 물리30/60/1·장외·카드 효과는 변경하지 않는다.

공통 소켓 계약: TABLE_CONFIGURE/GAME_SELECT의 gameCode=`ALKKAGI`, 정원2, targetScore없음. 기존 TABLE_GAME_START·GAME_START_STATE·GAME_CONNECTION_STATE·GAME_STATE·GAME_FORFEIT를 재사용한다. 공개 상태 gameCode/status/players/turnUserId와 알까기 Snapshot을 묶고 privateState는 본인 cards/choice만 포함한다. 관전자 privateState는빈객체다. 종료는 공통 GameFinished를 테이블 종료 연결부에 전달한다. 실제 DB 정산이 없는 로컬 검수에서는 테스트 결과 대역만 다음 판을 연다.

발사 예시(공원):
```json
{ "requestId": "요청식별자", "type": "GAME_ACTION_SEND", "payload": { "gameId": "서버 확정 경기 ID", "actionId": "UUID", "expectedVersion": 1, "input": { "type": "SHOT", "pieceId": "p13", "dx": 0, "dy": -1, "power": 0.8 } } }
```
카드 사용 input은 `{type:ITEM_USE,cardId,targetPieceIds,placement?}`, 선택은 `{type:CARD_CHOOSE,choiceId,optionId}`다. 플레이어 경기 채팅은 기존 GAME_SPECTATOR_CHAT_SEND로 같은 경기 승인자에게만 전달한다. 전용 데모의 CURSOR/ADVICE 경로를 공원 소켓으로 임의 우회하지 않으며 공원 관전자 커서/유령샷은 아직 별도 연결이 필요하다. 실제 DB/공용 서버 활성화와 구분한다.
