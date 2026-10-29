# 태블릿 테이블 설정·수동 시작

2026-10-27 사용자 요청 및 `TABLET_BE_REQUEST.md` 기준. 서버 코드·로컬 검증 범위이며 개발 서버 배포/FE 공동 검수는 별도다. DB 스키마·인증·예약/정산 구현은 바꾸지 않는다.

현재 legacy 맵의 채널별 전체16개 등록·좌표 및 시작 연결 비활성 진단은
[현재 맵 테이블 연결](legacy-table-integration.md)을 함께 따른다. 기존2개 ID와 HTTP/WS 필드는 유지한다.

## 사용 순서

연결·맵 확인·채널 입장 → TABLE_JOIN → 방장 TABLE_CONFIGURE → 선택 정원 전원 READY_SET → 방장 TABLE_START → 기존 GAME_START_STATE → 게임 → 종료/SETTLED → 좌석 유지·준비 해제·방장 승계.

`TABLE_CONFIGURE`로 새 태블릿의 MANUAL 모드를 명시적으로 선택한다. 기존 `GAME_SELECT`는 AUTO 모드를 유지하므로 현행 FE를 즉시 바꾸지 않는다. MANUAL 테이블에서 GAME_SELECT는 TABLE_CONFIGURATION_REQUIRED다. 설정은 서버 메모리에 저장·공유하며 서버 재시작 시 테이블은 비고 준비/타이머는 복원하지 않는다.

## 요청

모두 Raw WebSocket `/ws/tables`. 로그인/맵 검증·착석이 필요하다. userId/tableId를 주입하지 않는다.

```json
{
  "requestId": "configure-1",
  "type": "TABLE_CONFIGURE",
  "payload": {
    "gameCode": "DICE",
    "targetScore": 4000,
    "selectedPlayers": 2,
    "betAmountPerPlayer": 5,
    "expectedVersion": 3
  }
}
```

방장(`TABLE_STATE.selectorUserId`)만 설정한다. OMOK/DICE는 2명, ONE_CARD/LIAR_BRIDGE는 2~4명 중 정확한 정원. DICE만 targetScore=2000/4000/6000 필수이며 다른 게임은 필드를 생략한다. 현재 인원보다 작은 정원·범위 밖 판돈은 거절한다. expectedVersion은 최신 TABLE_STATE.version. 하나라도 바뀌면 전원 준비와 판돈 동의를 해제하고 대기 타이머를 취소한다. 동일 설정은 상태를 바꾸지 않는다.

```json
{
  "requestId": "ready-1",
  "type": "READY_SET",
  "payload": {"ready": true, "betAmountPerPlayer": 5, "expectedVersion": 4}
}
```

준비 취소는 `{"ready":false}`. 정원 전원이 준비해도 MANUAL에서는 자동 시작하지 않는다. 마지막 준비 때 서버가 120초 제한을 만든다.

```json
{
  "requestId": "start-1",
  "type": "TABLE_START",
  "payload": {"actionId": "start-unique-1", "expectedVersion": 6}
}
```

방장만 시작한다. actionId=1~64자, expectedVersion=관찰한 현재 버전. 같은 actionId와 버전은 같은 시도의 상태를 반환하고 재예약하지 않는다. 실패 후 새 전원 준비·새 actionId가 필요하다. 다른 내용은 START_ACTION_CONFLICT, 이전 설정/라운드는 START_ACTION_EXPIRED 또는 GAME_SETTINGS_CHANGED. 다른 사람이 시작하면 NOT_GAME_SELECTOR, 준비 부족은 TABLE_NOT_READY. 기존 예약 커밋 확인 후 엔진 생성 경로를 그대로 사용하며 판돈 즉시 차감으로 바꾸지 않는다. 예약 거절은 전원 준비 해제, 결과 불명은 기존 GAME_START_CHECK로 같은 시도 조회.

```json
{"requestId":"wait-check-1","type":"TABLE_HOST_WAIT_CHECK","payload":{}}
```

본인의 대기 타이머를 읽기만 한다. 연결/재접속·탭 복귀·수신 누락 시 재조회한다. 시간 만료 확인은 서버가 수행한다.

## 응답·알림

TABLE_STATE/TABLE_WATCH_STATE에 `selectedPlayers`(미선택 null), `startMode`(AUTO/MANUAL) 추가. HTTP `/api/v1/tables` 요약에도 `selectorUserId`, `selectedPlayers`, `startMode`를 추가한다. 설정/준비 응답은 기존 TABLE_STATE이며 타이머 알림은 별도로 따라온다.

```json
{
  "requestId": null,
  "type": "TABLE_HOST_WAIT_STATE",
  "payload": {
    "tableId": "table-1",
    "epoch": "server-room-generation",
    "revision": 8,
    "tableVersion": 6,
    "hostUserId": "101",
    "serverNow": 1793062800000,
    "expiresAt": 1793062920000,
    "cancelReason": null
  }
}
```

serverNow/expiresAt은 Unix ms이며 expiresAt=null은 타이머 없음이다. epoch는 테이블 메모리 세대, revision은 타이머 변경 순서, tableVersion은 테이블 상태 버전이다. FE는 세대/버전을 함께 비교하고 이전 세대·낮은 버전으로 되돌리지 않는다. 서버 상태 수신 후 남은 시간을 계산하며 FE 카운트다운 0만으로 퇴장 확정하지 않는다. 취소는 NOT_READY, SETTINGS_OR_MEMBERSHIP_CHANGED, START_APPROVED, HOST_START_TIMEOUT. 중복 준비·조회는 기존 만료시각을 유지한다.

```json
{
  "requestId": null,
  "type": "TABLE_HOST_TIMEOUT",
  "payload": {
    "eventId": "server-room-generation:8",
    "tableId": "table-1",
    "epoch": "server-room-generation",
    "revision": 11,
    "tableVersion": 8,
    "previousHostUserId": "101",
    "nextHostUserId": "202",
    "reason": "HOST_START_TIMEOUT",
    "serverNow": 1793062920000
  }
}
```

만료는 방장에게 TABLE_LEFT(reason=HOST_START_TIMEOUT), 남은 사용자에게 새 TABLE_STATE·타이머 취소·TABLE_HOST_TIMEOUT을 알린다. 이전 방장은 공원/소켓에서 내보내지 않고 테이블에서만 제거한다. 새 방장은 남은 착석자 중 무작위, ready는 전원 false. 남은 인원이 없으면 방장 null·빈 테이블. 참가자와 유효한 테이블 관전자에게 전달하며 과거 만료 이벤트를 신규 관전자에게 재생하지 않는다. 시작 승인과 만료는 같은 Hub 잠금에서 처리해 중복 확정하지 않는다.

## 재접속·결과 승계

MANUAL 대기석의 일반 네트워크 종료는 동일 로그인 세션에서 30초 내 복귀 시 좌석/준비/기존 만료시각을 보존한다. 새 접속권·필요 시 WORLD_MAP_CONFIRM·원래 CHANNEL_JOIN을 다시 수행한다. 맵 미확인 상태는 자동 복구하지 않고 유예도 연장하지 않는다. 유예 만료 시 퇴장/준비 해제, LOGOUT/MEMBER_DEACTIVATED 등 인증 종료는 즉시 대기석 정리. AUTO 대기석 기존 정책과 경기 중 GAME_CONNECTION_STATE 복구는 유지한다. 유예 복귀와 frozen 좌석 재접속은 채널 입장 전에 TABLE_STATE와 이 테이블의 GAME_START_STATE를 받으며, FE는 테이블 목록 조회 뒤 이를 적용한다([Story C](game-recovery.md#새로고침websocket-재접속-좌석시작-상태-수신-ontop-story-c)).

정산 확정 전에는 다음 경기를 열거나 결과 기반 방장을 바꾸지 않는다. 종료와 동일 경기의 전체 SETTLED 확인 후 남아 있는 WIN 참가자가 방장, 공동 WIN 또는 DRAW는 해당 남은 인원 중 서버 추첨. 승자가 없거나 모두 떠남/INVALID면 남은 착석자 전체 중 추첨한다. 중복 종료·정산 알림은 다시 추첨하지 않는다. 사용자가 2026-10-27 승인한 예외 정책이다.

## 오류·검증 범위

INVALID_PAYLOAD(형식/필드), NOT_SEATED, TABLE_BUSY, NOT_GAME_SELECTOR, GAME_SETTINGS_CHANGED, GAME_CONFIGURATION_INVALID, GAME_OPTIONS_REQUIRED, TABLE_NOT_READY, START_NOT_CONFIGURED, START_ACTION_CONFLICT/EXPIRED. 만료 직후 요청은 이미 퇴장했으므로 NOT_SEATED가 될 수 있다. 오류는 원래 requestId에 대응하며 상태는 최신 조회로 확인한다.

TabletPolicyTests: 정확한 정원·설정 원자성·타이머·추첨 후보. TabletStartFlowTests: 실제 Hub/직렬화/송신·예약 경계 대역·만료·재접속/로그아웃·정산 승계. TabletWebSocketTests: 내장 서버의 인증된 실제 Raw WebSocket 왕복. 대역의 예약/정산 알림은 실제 DB 트랜잭션 성공을 의미하지 않는다.
