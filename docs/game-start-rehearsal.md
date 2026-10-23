# 게임 시작 연동 검증

최소 2명 이상 현재 참가자가 전원 준비하면 시작 요청을 보내고 결과를 받아 화면에 표시하는 개발용 기능이다. 팀원의 DB 코드가 없어도 네 쪽 흐름을 확인할 수 있다. **엽전 차감·DB 저장·실제 게임 실행·AI 대행은 하지 않는다.**

기준은 사용자 지정 [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71)다. 전원 준비 시 별도 카운트다운 없이 시작 요청을 보낸다. 과거의 `countdown-millis` 설정·COUNTDOWN 상태·마감 시각 필드는 제거했다. 실제 경기 진입에는 B의 성공 결과가 필요하며, 즉시 시작 요청을 실제 DB 처리의 즉시 완료와 혼동하지 않는다. [정책 대조표](erd-policy-alignment.md)에 ERD 문서와 충돌을 구분했다.

## 켜는 방법

IntelliJ에서 활성화된 프로파일은 `local`로 두고, 실행 구성의 프로그램 인수에 다음을 추가한다.

```text
--ontop.start-rehearsal.enabled=true
```

터미널에서는 `backend/`에서 실행한다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local --ontop.start-rehearsal.enabled=true'
```

[개발 페이지](http://localhost:8080/dev/tables)를 2~4개 탭에서 열고 연결 → 같은 테이블 착석 → 첫 착석자의 [게임 선택](websocket-api/07-game-select.md) → 현재 참가자 전원 준비를 누른다. 선택한 게임 코드로 시작 요청을 보내고 화면에 성공 결과를 표시한다. 네 게임의 선택·연동 경계를 검증하며 실제 게임 규칙을 실행하지 않는다. 미착석·게임 미선택 상태의 GAME_START_STATE.gameCode는 null이다.

기본값은 꺼짐이다. 켜지 않으면 기존 명세대로 `allReady=true` 표시만 하고 준비 취소·퇴장이 가능하다. `local` 외에는 플래그를 켜도 개발 경로와 검증 대역이 활성화되지 않는다.

## 확인할 상황

추가 인수로 검증 대역의 응답을 바꿀 수 있다. 여기서 거절은 실제 계정의 잔액을 확인한 결과가 아니라 정해진 검증 응답이다.

| 인수 | 확인할 동작 |
| --- | --- |
| 기본값 `SUCCESS` | 전원 준비 → 요청 → 연동 검증 성공 |
| `--ontop.start-rehearsal.scenario=REJECT` | 전원 준비 → 거절 → 전원 준비 초기화·다시 준비 가능 |
| `--ontop.start-rehearsal.scenario=DELAYED_SUCCESS` | 결과 대기 → 같은 요청의 결과 확인 → 검증 성공 |
| `--ontop.start-rehearsal.delay-millis=5000` | 응답 대기 시간 조정. 기본 500ms, 0~60000ms |

`DELAYED_SUCCESS`는 지정 시간이 지나도 화면을 자동 갱신하지 않는다. **시작 결과 다시 확인** 버튼으로 동일한 시작 시도의 결과를 조회한다. 새 시작 요청을 보내는 버튼이 아니다.

성공 뒤에는 실제 경기·종료 처리가 없어 좌석을 예약한 채 유지한다. 다른 테이블을 사용하거나 서버를 재시작해서 새로 검증한다. 새 연결은 새 임시 사용자이며 예약된 좌석을 복구하지 않는다.

## 서버 내부의 흐름

1. `TableHub.beginStartIfReady()`가 준비된 참가자와 좌석을 복사하고 시작 시도 ID를 한 번 생성한다.
2. `TableStartAttempt`가 `STARTING` 상태를 유지한다. 그동안 착석·퇴장·준비 변경은 `TABLE_BUSY`로 거절한다. 같은 테이블의 반복 착석은 현재 상태만 반환한다.
3. 별도 작업 스레드가 상태 잠금 밖에서 `GameStartGateway.startGame()`을 호출한다.
4. 확정 성공이면 `CONFIRMED`, 확정 거절이면 `WAITING`으로 바꾸고 준비를 초기화한다. 결과 불명·잘못된 결과·충돌이면 `STARTING`을 유지한다.
5. 결과 조회는 `findStartResult()`를 사용한다. 현재 시도와 다른 ID·참가자·판돈의 성공 결과는 받아들이지 않는다.

지금 연결된 `LocalGameStartGateway`는 서버 메모리에 검증 결과를 보관하고 `demo-game-...` ID를 만든다. 같은 시도 ID와 같은 내용에는 같은 결과를, 다른 내용에는 충돌을 반환한다. 실제 B 구현에 필요한 트랜잭션·다른 시도 ID 간 동시 참가 방지·영속적 중복 방지·재시작 복구는 제공하지 않는다.

`GameStartGateway`는 A가 부르고 B가 구현할 내부 메서드 경계다. 실제 인증 ID·게임 실행·장애 복구를 연동하기 전에는 이 검증 모드를 실제 차감 구현으로 교체하지 않는다.

## 검증 모드의 추가 메시지

기존 요청 형식과 `CONNECTED`, `TABLE_STATE`는 유지한다. 검증 모드에서만 아래 두 메시지를 추가한다.

### GAME_START_STATE

서버 → 클라이언트. 연결 직후에는 `tableId=null`, `phase=NOT_SEATED`로 검증 모드임을 알려준다. 착석하면 `WAITING`, 전원 준비 후에는 `STARTING`, 검증 성공 후에는 `CONFIRMED`다.

```json
{
  "requestId": null,
  "type": "GAME_START_STATE",
  "payload": {
    "tableId": "table-1",
    "revision": 2,
    "phase": "CONFIRMED",
    "startAttemptId": "2b119ea2-fd96-4efe-9d46-56d848a1ebc3",
    "gameCode": "OMOK",
    "gameSessionId": "demo-game-example",
    "code": null,
    "simulation": true
  }
}
```

- 같은 테이블 참가자에게만 알린다. `revision`은 테이블별 시작 상태 알림 순서이며 기존 좌석 `version`과 별개다.
- 화면은 낮은 revision을 무시하며 새 연결에서 캐시를 비운다.
- 거절은 공개 코드 `START_REJECTED`로만 알리고 계정별 잔액·참가 제한 사유를 전파하지 않는다.
- 결과 미확정은 `START_PENDING`, `START_RESULT_UNKNOWN`, `START_RESULT_INVALID`, `START_CONFLICT`로 표시한다. 대기로 복귀하거나 새 예약을 요청하지 않는다.

### GAME_START_CHECK

클라이언트 → 서버. 현재 착석한 테이블의 같은 시작 시도 결과를 조회한다. tableId·사용자·시도 ID를 클라이언트가 지정하지 않는다.

```json
{
  "requestId": "check-1",
  "type": "GAME_START_CHECK",
  "payload": {}
}
```

요청 ID를 복사한 현재 `GAME_START_STATE`를 먼저 응답한다. 조회가 필요하면 별도 작업으로 조회하고 결과를 테이블 참가자에게 요청 ID가 null인 알림으로 보낸다. 첫 응답은 최종 결과 도착을 보장하는 응답이 아니다. 진행 중인 조회가 있으면 추가 조회 작업을 겹쳐 실행하지 않는다.

- 미착석이면 `NOT_SEATED`, 시작 요청이 없으면 `START_NOT_REQUESTED`다.
- 검증 모드가 꺼져 있으면 `UNSUPPORTED_MESSAGE_TYPE`이다.
- 허용되지 않은 payload 필드는 기존 규칙대로 `INVALID_PAYLOAD`다.

## 연결 종료 경계

시작 요청을 보내기로 확정하기 전에 참가자의 종료를 감지하면 시작을 취소하고 준비·좌석을 정리한다. 호출 확정 이후에는 실제 메서드 진입 직전의 종료라도 결과를 기다린다.

호출 확정 뒤 연결이 끊기면 참가자 좌석을 유지한다. B가 확정 거절한 경우에만 대기로 복귀하면서 끊긴 좌석을 정리한다. 성공 뒤 연결 종료도 좌석을 유지하며, 여기서는 AI나 실제 경기를 실행하지 않는다.

## 관련 문서

- [기존 대기 WebSocket 명세](websocket-api.md)
- [B와 논의할 정식 시작 계약 초안](game-start-contract-draft.md)

2026-10-23: 내부 성공 결과는 RESERVED(판돈 예약 완료)로 통일했다. 이 개발 대역은 예약 성공 형식만 모사하며 실제 지갑 예약·차감·정산을 하지 않는다. 실제 인증 시작의 예약 조건은 [현행 연결 계약](committed-game-start.md)을 따른다.
