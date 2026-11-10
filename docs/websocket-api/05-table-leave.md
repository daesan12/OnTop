# 🚪 테이블 퇴장

> **TABLE_LEAVE / TABLE_LEFT** · 요청: 클라이언트 → 서버 / 완료: 서버 → 클라이언트

| 항목 | 내용 |
| --- | --- |
| 도메인 | 테이블 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | 빈 객체 {} |
| 응답·알림 요약 | 본인 TABLE_LEFT / 남은 참가자 TABLE_STATE / 실패 ERROR |
| 수신 대상 | TABLE_LEFT는 본인, 상태 변경은 남은 참가자 |

### 요청

```json
{
  "requestId": "req-003",
  "type": "TABLE_LEAVE",
  "payload": {}
}
```

현재 연결의 사용자가 착석한 테이블에서 퇴장합니다. 테이블·사용자·좌석을 별도 지정하지 않습니다.

### 본인 응답

```json
{
  "requestId": "req-003",
  "type": "TABLE_LEFT",
  "payload": {
    "tableId": "table-1"
  }
}
```

### 상태 변화

- 본인의 좌석을 비우고 남은 참가자의 준비를 false로 초기화합니다.
- 테이블 버전을 1 증가시킵니다.
- 퇴장 요청자에게 `TABLE_LEFT`, 남은 참가자에게 요청 ID가 null인 `TABLE_STATE`를 전송합니다.
- 퇴장한 연결에는 해당 테이블의 이후 상태를 보내지 않습니다. 퇴장 후 다른 테이블에 착석할 수 있습니다.
- 모든 참가자가 나가도 개발용 테이블은 유지합니다. 테이블이 비었다는 이유로 버전을 초기화하지 않습니다.
- 선택자가 나가면 남은 참가자 중 가장 먼저 착석한 사람에게 선택 권한을 넘깁니다. 남은 사람이 있으면 게임 선택은 유지하고, 빈 테이블이면 `gameCode`·`selectorUserId`는 null입니다.

### 실패

- `INVALID_PAYLOAD`: payload가 빈 객체가 아님. 공통 형식 오류는 `INVALID_MESSAGE`입니다.
- `NOT_SEATED`: 이미 미착석 상태. 반복 퇴장은 성공으로 위장하지 않고 이 오류를 반환합니다.
- `TABLE_BUSY`: 시작 검증의 STARTING·CONFIRMED 상태에서 퇴장 요청.
- `GAME_RECOVERY_REQUIRED`: 경기 담당이 등록된 인증 모드에서 복구 조회 중·진행 경기·만료 미확정 상태. 착석 여부 검사보다 먼저 확인합니다.
- `TABLE_LEAVE_PENDING`: 같은 연결의 할리갈리 자연 탈락 퇴장 확인이 끝나기 전에 보낸 새 퇴장 요청.

실패 시 기존 좌석·준비 상태를 유지합니다. 실제 경기 기권 요청으로 사용하지 않습니다.

### 예외: 할리갈리 자연 탈락자의 경기 중 퇴장

| 참가자 | 경기 중 `TABLE_LEAVE` | 전적 |
| --- | --- | --- |
| 활성 참가자 | 기존대로 거절(`GAME_RECOVERY_REQUIRED`·`TABLE_BUSY`). 경기를 그만두려면 `GAME_FORFEIT` | 기권하면 `FORFEIT` |
| 자연 탈락자(`eliminated=true`, `forfeited=false`) | 허용. 좌석만 해제 | 경기 종료 시 `LOSE` 유지 |

- 대상: 진행 중(`PLAYING`)인 `HALLI_GALLI` 확정 경기에 아직 앉아 있는 참가자. 3~4인 경기가 주 대상입니다(2인은 탈락 즉시 종료).
- 서버가 요청 시점의 최신 엔진 공개 상태로 본인의 자연 탈락을 확인합니다. 클라이언트가 보낸 상태는 쓰지 않습니다. 엔진 조회는 Hub 잠금 밖에서 하고, 완료 후 좌석·경기를 다시 확인합니다. 조건이 맞지 않으면 위 기존 규칙으로 판정합니다.
- 응답은 기존과 같은 요청 ID의 `TABLE_LEFT`와 `GAME_START_STATE(NOT_SEATED)`입니다. 경기 상태 전송을 멈추고 복구 슬롯을 다시 읽어 `LOBBY`로 돌아갑니다. 이후 공원 이동·관전·미니게임은 기존 규칙대로 이용할 수 있습니다.
- 기권이 아니므로 `GameParticipantLeft`·이탈 기록(`leave_reason`)·`GAME_FORFEIT`를 만들지 않습니다. 경기 참가·탈락 상태와 판돈 예약은 그대로 남고 경기 종료 정산에서 −판돈으로 처리됩니다. 남은 참가자의 경기·종 판정은 계속됩니다.
- 캐릭터 월드 좌표는 바꾸지 않습니다. 앉기 전 서 있던 테이블 옆에서 이동을 재개합니다.
- 정산 전에는 다른 테이블 착석이 `MEMBER_ALREADY_IN_GAME`으로 거절됩니다([테이블 착석](02-table-join.md)). 관전은 제한하지 않습니다.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)
