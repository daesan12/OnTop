# 게임별 공통 통신 분기

기존 GAME_ACTION_SEND / GAME_STATE_CHECK / GAME_WATCH / GAME_RECONNECT_CHECK의 공통 JSON 형식은 바꾸지 않는다. 서버가 생성한 경기 ID로 입력·상태·복구 담당 엔진을 선택한다. 현재 규칙 엔진은 오목·주사위·원카드·거짓말 다리다. 게임별 input과 상태는 각 계약을 따른다.

## 서버 내부 연결

- 엔진은 GameEngine을 구현하고 공유 GameEngineRouter를 생성자에서 받는다.
- 참가 확정 후 게임 생성 검증을 마친 다음, 엔진의 경기 잠금 안에서 register(engine,gameId,tableId,players)를 호출하고 경기 상태를 설치한다. 엔진별 임의 ID 공간에 같은 gameId를 중복 등록할 수 없다.
- 진행 중 참가자·테이블 점유를 엔진 사이에 공유한다. 서버가 다른 엔진의 동시 생성을 요청해도 한 점유만 성공한다. DB의 시작/차감 확정은 별도 계약이다.
- 종료 확정 때 finished(engine,gameId)를 호출한다. 과거 경기는 조회 가능하게 남기고 사용자/테이블 점유만 해제한다. 중복 또는 늦은 종료로 새 경기 점유를 해제하지 않는다.
- 모든 Gateway의 앱 주입 대상은 @Primary 라우터다. 각 엔진 설정이 GameEngineGateways를 @Import하며, 엔진이 없는 기본 local에는 이를 등록하지 않는다.
- 복구 조회 중 새 경기가 등록되면 최대3번 다시 읽는다. 다른 게임의 시각/버전으로 최신을 추정하지 않는다. 등록된 경기의 복구 상태가 없거나 사용자/경기가 다르면 안전하게 실패한다.
- 라우터 잠금 안에서 엔진을 호출하지 않는다. 엔진 내부 차례·버전·입력·역할/개인 상태 검증과 기존 Hub의 복구·관전 거리는 그대로 유지한다.

## 현재 범위

OmokEngine, [FarkleEngine](farkle.md), [OneCardEngine](onecard.md), [BridgeEngine](bridge.md)에 등록/종료 색인을 연결했다. FarkleFlowTests는 주사위 종료 뒤 오목 복구 전환을, OneCardFlowTests는 본인 손패 격리·관전·복귀·30초 넘김을 실제 소켓으로 검증한다. 원카드 기권 손패는 2026-10-22 사용자 확정 REMOVE(이번 경기에서 제외)이며 정식 서버의 별도 정책 설정은 필요하지 않다. 실제 프론트·로그인·시작 차감·DB 정산 연동 완료를 뜻하지 않는다.

검증 진입점은 GameEngineRouterTests, GameEngineProfileTests, OmokEngineTests, OmokFlowTests, OmokDemoHttpTests, TableProfileTests다. 서버 메모리 색인은 재시작/다중 서버의 참가/복구 원장이 아니다.
