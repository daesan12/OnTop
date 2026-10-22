# 오목 실행 계약

제품 기준은 OnTop v0.4, 시간 정책은 2026-10-21 사용자 확정이다. 2026-10-21 사용자 요청으로 자유룰에서 **렌주 금수 판정**으로 변경했다. 15×15, 흑 선공이며 흑은 정확히 5목, 백은 5개 이상 연결하면 승리한다. 흑의 삼삼·사사·장목은 금수로 거절한다. 판이 모두 차고 승자가 없으면 무승부로 판정하며 재화 처리는 하지 않는다.

## 흑 금수와 승리 판정

- 열린 3 두 개(33), 서로 다른 4 두 개(44), 6개 이상 연속(장목)을 검사한다. 같은 열린 4의 양 끝은 한 개로 세고, 같은 방향의 서로 다른 4는 각각 센다.
- 열린 3은 합법적인 다음 흑 착수로 열린 연속 4를 만들 수 있어야 한다. 판 끝·백돌·장목/44/33 금수 때문에 확장 불가능한 가짜 3은 제외하며 33 확장은 재귀 검사한다.
- [RIF 정의·9.2·9.3](https://gomoku.renju.net/rifrules/) 기준으로 같은 수에서 정확한 5목을 완성하면 금수보다 승리를 우선한다. 백은 금수 제한이 없다.
- 온라인 입력 정책: 금수는 `GAME_ACTION_FORBIDDEN_MOVE`로 거절한다. 판·수순·버전·마지막 수·차례·기존 turnDeadline을 바꾸거나 패배 처리하지 않는다. 흑은 남은 시간 안에 다른 위치에 착수한다. 판정 중 가상 돌도 원복한다.
- 적용 범위는 금수/승리 판정이며 대회용 오프닝 교환·첫 수 중앙 강제·패스는 도입하지 않는다. 기존 흑백 배정과 30초 정책은 유지한다.

## 시간과 종료

- 한 수 30초, 총시간 제한 없음. 서버가 정한 `turnDeadline`에 도달한 입력부터 거절하고 해당 차례 사용자가 시간패한다. 매 착수 성공 후 상대의 새 30초가 시작된다.
- 재접속은 기존 판·버전·턴 마감을 그대로 읽는다. 끊김·조회·재연결로 턴 시간을 멈추거나 늘리지 않는다. 재접속 유예가 남아 있어도 턴 마감이 먼저면 경기 종료다.
- 스케줄러가 약 200ms마다 검사한다. 늦게 검사해도 `endedAt`은 원래 마감 시각이다. 착수도 같은 경기 잠금 안에서 서버 시각을 검사하여 스케줄러 지연으로 마감 후 착수할 수 없다.
- 종료 사유는 `FIVE_IN_ROW`, `BOARD_FULL`, `TURN_TIMEOUT`, `RECONNECT_EXPIRED`다. 종료 후 새 착수를 거절하며 이미 반영한 actionId의 같은 요청 재확인은 기존 결과를 반환한다.

## 기존 WebSocket으로 착수

새 연결/URL은 만들지 않는다. 기존 인증된 `/ws/tables`와 `GAME_ACTION_SEND`를 사용한다.

```json
{
  "requestId": "move-1",
  "type": "GAME_ACTION_SEND",
  "payload": {
    "gameId": "실제-경기-ID",
    "actionId": "착수별-새로운-ID",
    "expectedVersion": 0,
    "input": { "x": 7, "y": 7 }
  }
}
```

`x`는 열, `y`는 행이며 각각 0~14 정수다. 3D 월드의 x/y/z와 다른 **오목판 좌표**다. input은 x/y만 허용한다. 돌 색·userId·승패·시각을 클라이언트가 지정하지 않는다. 서버는 참가자·차례·버전·빈칸·마감 시각을 원자적으로 검사한다. 오류는 기존 `GAME_ACTION_*`를 사용한다.

같은 사용자/경기/actionId와 같은 expectedVersion·input은 중복 착수하지 않고 기존 `GAME_ACTION_RESULT`를 반환한다. 내용이 다르면 `GAME_ACTION_ACTION_ID_CONFLICT`다. 새 행동은 새 actionId를 사용한다. 재조회가 아니라 새 착수라면 최신 GAME_STATE.version을 사용한다.

## 상태 전송

기존 `GAME_STATE`의 `publicState`에 아래 값을 담는다. 참가자·관전자 모두 privateState는 빈 객체다. 관전은 기존 인증·채널·20m 범위 검사와 함께 적용한다.

| 필드 | 내용 |
| --- | --- |
| gameCode / status | OMOK / PLAYING 또는 FINISHED |
| boardSize / board | 15, 15×15 배열. board[y][x]: 빈칸0/흑1/백2 |
| blackUserId / whiteUserId | 서버가 정한 흑·백 내부 계정 ID 문자열 |
| turnUserId / turnDeadline | 현재 차례 ID·UTC 마감. 종료 후 null |
| moveCount / lastMove | 착수 수, 마지막 {x,y,stone:BLACK 또는 WHITE}. 최초 lastMove=null |
| winnerUserId | 승자 ID 문자열. 진행 중/무승부는 null |
| endReason / endedAt | 종료 사유·UTC 종료 시각. 진행 중 null |

외부 gameId/version/role/publicState/privateState 포맷은 유지한다. 오목 모듈은 내부 tableId도 GameStateView에 전달하지만 외부 JSON에는 노출하지 않는다. 서버의 시간 만료는 GameStateChanged를 발행하므로 사용자 입력 없이도 상태가 전송된다.

## 서버 활성화·시작 연결

기본값은 꺼짐이다. `local`에서 `ontop.games.omok.enabled=true`로 실제 오목 엔진을 등록하며 인증된 경기 통신에는 기존 `ontop.websocket.authenticated=true`와 실제 사용자 검증기가 필요하다. 테스트 헤더를 운영 코드에 추가하지 않았다.

참가 확정·차감 커밋을 확인한 **서버 내부 코드**가 `OmokEngine.create(gameId, tableId, blackUserId, whiteUserId)`를 호출한다. 흑/백은 이 호출자가 정해 전달한다. 같은 내용의 같은 경기 생성은 기존 판을 초기화하지 않는다. 다른 내용의 동일 ID, 같은 테이블/참가자의 다른 진행 오목 경기는 거절한다. 외부 임의 생성 API는 없다.

전원 준비→실제 시작 트랜잭션→이 생성 메서드 연결은 기존 시작 계약의 정식 연동 경계다. `start-rehearsal`은 dev 대역용이며 이 옵션을 켜서 실제 오목을 시작하는 방식이 아니다. 실제 차감·참가 기록·흑백 배정·종료/정산 후 다음 판 허용은 참가 확정 담당 코드가 연결해야 한다.

`OmokEngine`은 입력/상태/복구 Gateway를 구현한다. [공통 라우터](game-engine-routing.md)가 서버에 등록된 gameId로 분기하므로 [주사위 엔진](farkle.md)과 함께 켤 수 있다. 참가자·테이블의 중복 진행은 엔진 사이에서도 차단한다.

## 승패와 정산 구분

`OmokGameFinished`는 서버 승패 판정의 내부 알림이며 GameResultCommitted가 아니다. 재화 담당이 결과 저장·정산을 확정한 뒤 기존 GameResultGateway/GameResultCommitted로 전달해야 한다. 오목 모듈은 엽전 차감·지급을 하지 않고 가짜 SETTLED나 잔액을 만들지 않는다. 무승부의 재화 정책은 기존 미확정 항목으로 남긴다.

경기·중복 기록은 메모리이며 종료 판도 재조회용으로 보존한다. 재시작·다중 서버·DB 영속성·종료 이벤트 전달 보장을 제공하지 않는다. 알림 실패는 착수 실패로 바꾸지 않으며 GAME_STATE_CHECK/복구 조회로 확정 상태를 다시 읽을 수 있다. 이벤트 소비자의 영속 저장·재처리와 종료 경기 보존/정리는 정식 저장 연동에서 마련해야 한다.

## 한 번에 검증

눈으로 직접 플레이할 때는 [오목 브라우저 테스트](omok-demo.md)를 사용한다. 흑·백·관전자 화면과 테스트 전용 실행 방법을 안내한다.

`backend/`에서 `.\gradlew.bat flowTest`를 실행한다. OmokFlowTests는 실제 오목 규칙·Spring 서버·소켓·거리 서비스를 사용하여 착수/관전/중복/heartbeat 복귀/승리와 자동 시간패를 검사한다. 인증·참가 확정과 시간 경계는 테스트 대역/제어 시계이며 DB·지급 성공이나 실제 30초 대기 시험이 아니다.

금수 회귀도 같은 명령에 포함된다. 삼삼·사사·장목 각각의 소켓 거절 뒤 상태 불변·합법 재착수를 확인하며, 별도 연속 흐름에서는 금수 → heartbeat 단절 → 같은 판/마감으로 복귀 → 29초 진행 → 원래 30초 시간패 → 참가자/관전자 종료 수신·추가 입력 차단을 검증한다. 금수나 복귀가 시간을 늘리지 않는지 확인하는 검사이며 새 API를 추가하지 않는다.

## 프론트 연동 명세·예제

기존 Notion [경기 입력 전달](https://app.notion.com/p/3ff161842b86805d82b8f359845312f8), [상태 수신·자동 갱신](https://app.notion.com/p/3ff161842b86809497f0d0f87db8e98b), [복구 조회](https://app.notion.com/p/3ff161842b8680d785c8c027000052d9)에 오목 규칙을 반영했다. 공통 API의 다른 게임·정식 시작 연동까지 완료한 것은 아니므로 담당자 대산 장·진행 중 속성은 유지한다.

[Postman 웹](https://dfd333-5957.postman.co/workspace/My-Workspace~fef8d4dd-529e-48e5-8bde-17f840fd2dd3/ws-raw-request/6ad7466f88a68a951684b2d7)의 기존 06 경기 통신 요청에서 02 착수·09 동일 행동 재확인·10 내용 충돌·11 복귀 조회를 사용한다. 실행 선행조건과 30초/상태 규칙은 OnTop WebSocket Overview를 따른다. 2026-10-21 새로고침 후 웹 저장본을 대조했다. 웹 저장 확인은 실제 로그인·시작·지급 성공이나 데스크톱 동기화 검증을 뜻하지 않는다.

같은 날 렌주 후속 변경도 Overview에 저장하고 새로고침으로 흑 금수·오류 코드·판/버전/차례/마감 유지·흑백 승리 조건을 재확인했다. 입력 JSON 형태는 그대로다.
