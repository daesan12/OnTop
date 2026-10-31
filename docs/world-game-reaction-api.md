# 기권·패배 공개 연출

담당 장대산 · 기존 경기 종료 흐름 S15P31B105-72. 구현·로컬 검증이며 배포/실제 계정 공동 검수는 별도다.
기존 `/ws/tables` 인증 연결과 채널 입장을 사용한다. 새 REST·클라이언트 송신 요청은 없다.

## 서버 알림 · WORLD_GAME_REACTION

```json
{
  "requestId": null,
  "type": "WORLD_GAME_REACTION",
  "payload": {
    "eventId": "game-1:reaction:202",
    "gameId": "game-1",
    "tableId": "table-uuid",
    "channelId": "channel-1",
    "gameCode": "ONE_CARD",
    "version": 7,
    "userId": "202",
    "kind": "FORFEIT",
    "remainingBefore": 3,
    "participantCount": 4,
    "motion": "head-clutch",
    "durationMs": 3600,
    "occurredAt": "2026-10-26T09:00:00Z"
  }
}
```

| 필드 | 의미 |
| --- | --- |
| eventId | 경기/대상자별 고정 사건 ID. 요청 actionId·정산 ID와 별개 |
| gameId / tableId / channelId | 확정 경기가 진행된 서버 식별자 |
| gameCode / version | `OMOK`·`DICE`·`ONE_CARD`·`LIAR_BRIDGE`·`DICE_LEDGER` 및 확정된 엔진 상태 버전 |
| userId | 연출 대상 회원 ID 문자열 |
| kind | FORFEIT=참가 자격 상실, DEFEAT=최종 일반 패배 |
| remainingBefore | 해당 판정 직전에 참가 자격이 남아 있던 인원. 시작 인원/말 개수가 아님 |
| participantCount | 경기 시작 시 최초 참가 인원. 잔여 인원과 구분 |
| motion / durationMs | 최초 2인 경기에서 EXPLICIT_LEAVE 기권일 때만 table-flip/2800. 일반 패배·연결 이탈·다인 경기는 head-clutch/3600 |
| occurredAt | 서버 확정 시각(UTC ISO 8601). 표시 동기화의 기준이며 클라이언트 시계 보정을 대신하지 않음 |

네 엔진의 잠금 안에서 순서대로 확정한다. 4명 중 순차 기권은 4→3→2를 각각 담는다.
같은 최종 판정의 일반 패배자들은 같은 직전 인원을 사용한다. 먼저 기권한 사람에게 종료 시 다시 보내지 않는다.
승자·무승부·승자 없는 무효 종료는 일반 패배를 만들지 않는다. 다리는 pendingForfeit로 처음
입력 자격을 잃는 시점에 FORFEIT를 확정하며 이후 말 제거/forfeited 전환에서 반복하지 않는다.
기존 GameParticipantLeft/GameFinished, 승패·정산·기권 영수증 계약은 유지한다.

## 수신 범위와 재접속

- 현재 경기 참가자와 테이블 중심 XZ 거리 20m 이내(경계 포함) 사용자에게 전송한다.
  모두 같은 채널에 입장하고 필요한 맵 확인을 마친 연결이어야 한다.
  기존 공개 관전자도 이 범위에서 수신하며 GAME_WATCH를 하지 않은 주변 사용자도 받는다.
- 대상자·경기·게임 종류가 현재 서버 테이블의 확정 시작 정보와 맞는지 대조한다.
  과거 경기 사건은 무시하고 같은 테이블의 현재 경기에서는 대상자별 한 번만 보낸다.
- 별도 저장/이력 조회/재접속 재전송은 없다. 초기 관전·재접속 상태에서 과거 모션을 추정하지 않는다.
  경기 상태 구독과 이 알림 사이의 순서는 보장하지 않으므로 연속 버전 변화만으로 다시 판정하지 않는다.
- 손패·개인 주사위·지갑·정산 금액을 포함하지 않는다. 모션은 표시 전용이며 테이블/말/승패는 바꾸지 않는다.

## FE 연결

FE 기존 DefeatTimeline의 `(gameId, userId)` 키와 eventId로 공개 상태 추론/이 알림의 중복을 함께 막는다.
대상자가 해당 테이블에 표시되는 경우에만 재생하고 이동·퇴장·채널 변경·새 경기 등 기존 취소 조건을 유지한다.
이미 지속 시간이 지난 알림을 새 2.8/3.6초로 다시 시작하지 않는다. 사용자 시계 차이가 있으면 기존 서버 시각
보정 정책을 적용해야 하며 네트워크 수신만으로 프레임 단위 동시 재생을 보장하지 않는다.

FE는 이 공개 알림을 최신 공원 테이블 앵커와 연결한다. 일반 패배에서 판 엎기를 추론하지 않는다.
2인 명시적 기권의 판·엽전 연출과 유지 상태는 아래 별도 스냅샷을 사용한다.

## 공원에 남는 판·엽전 · WORLD_PARK_DEBRIS_STATE (2026-10-31)

서버 알림이며 클라이언트 요청은 없다. 최초 2인 경기의 명시적 기권을 서버가 확정할 때만
판 1개와 장식 엽전 12개를 추가한다. 오목은 연출용 흑·백 바둑알 5개도 개별 물체로 추가한다.
일반 패배, 접속 종료, 4인 경기에서 2명만 남은 경우에는 생성하지 않는다.
지원 게임 코드는 `OMOK`, `DICE`, `ONE_CARD`, `LIAR_BRIDGE`, `DICE_LEDGER`다.
시작 인원은 예약된 경기 참가자 목록에서 확인하며 직전 잔여 인원으로 추정하지 않는다.

```json
{"requestId":null,"type":"WORLD_PARK_DEBRIS_STATE","payload":{
  "channelId":"channel-1","mapVersion":"현재 맵 해시","version":1,
  "items":[{"id":"game-1:reaction:202","gameId":"game-1","tableId":"table-uuid",
    "anchorId":"table-1","gameCode":"OMOK","userId":"202","occurredAt":"2026-10-31T00:00:00Z",
    "throwYaw":0,"seed":123,"parts":["board","coin-0","coin-1","coin-2","coin-3","coin-4","coin-5",
      "coin-6","coin-7","coin-8","coin-9","coin-10","coin-11",
      "stone-0","stone-1","stone-2","stone-3","stone-4"]}]
}}
```

- 같은 채널의 맵 확인을 마친 모든 연결에 전체 상태를 보낸다. 입장·재입장에도 현재 상태를 전송한다.
  version은 채널별 증가 값이다. FE는 오래된 버전을 무시하고 새 스냅샷으로 교체한다.
- occurredAt과 seed/throwYaw로 모든 사용자가 같은 궤적·착지 위치를 계산한다. 0.55초에 원래 게임판을
  숨기고 판·엽전을 던진다. 약 2.8초 후 착지하며 **기권 확정 occurredAt부터 15초 후 서버가 묶음 전체를 제거**한다.
  정리는 1초 주기로 확인하고 변경된 채널에 증가한 version의 전체 상태를 보낸다. 만료 전 입장하면 착지 상태를,
  만료 후 정리가 끝난 채널에 입장하면 잔해가 제거된 상태를 받는다. 개별 물체를 청소해도 만료 시각은 연장하지 않는다.
- 오목의 바둑알은 판 모델에서 분리되어 서로 다른 방향으로 날아가고 바닥에서 각각 튀어 멈춘다.
  `stone-0`부터 `stone-4`까지 개별 유지·청소하며 판 위에 부착한 장식 바둑알은 렌더링하지 않는다.
  현재 5개는 기존 연출 모델의 수량이며 실제 경기의 모든 착수 기록을 복제한 것은 아니다.
- 참가자 화면은 잠깐 테이블을 바라보며 기권 아바타 모션을 보여주고 이후 결과창을 연다.
  모션 줄이기 설정에서는 이동 연출 없이 착지한 물체와 결과를 표시한다.
- 장식 엽전은 지갑·베팅·정산과 무관하다. 물체는 이동·충돌·다음 경기 진행을 막지 않는다.
  테이블과 의자는 유지하고 새 경기는 새 게임판을 사용한다.
- 향후 청소 AI 연결점은 서버 내부 `TableHub.cleanParkDebris(channelId, itemId, part)`다.
  물체 ID는 `itemId/board`, `itemId/coin-0`…`coin-11`, 오목의 `itemId/stone-0`…`stone-4`다.
  제거 후 증가한 version으로 공유한다.
  현재 청소 AI·클라이언트 삭제 API는 제공하지 않는다.
- **현재 유지 범위는 서버 프로세스 메모리**다. 경기 종료·새 경기·재접속 후에는 유지하지만 서버 재시작 시 초기화한다.
  DB 영속화·다중 서버 간 동기화는 후속 작업이다. 채널당 최대 64회분(오목만 있으면 최대 1,152개)을 유지하며, 상한에서
  기존 잔해를 지우지 않고 추가 생성을 멈춘다. AI 청소 또는 15초 자동 정리로 자리가 생기면 다시 추가한다.
- FE/BE 동시 배포가 필요하다. 현재 로컬 구현·검증이며 운영 배포 확인은 별도다.

## 검증

GameDefeatTests/GameLifecycleTests는 시작 인원·직전 인원·pendingForfeit·일반 패배·중복/무승부를 검사한다.
DiceLedgerEngineTests/StartTests/FlowTests와 함께 주사위 장부의 기존 시작·진행·기권 흐름도 확인한다.
WorldGameReactionTests는 오목·주사위 장부에서 현재 경기 대조·20m/20.01m·채널 격리·비구독자·재접속을 Hub 송신 큐에서 검사한다.
WorldGameReactionFlowTests는 별도 Spring 서버에서 실제 오목 시간패→EventListener→RawWS의
참가자/관전자/비구독자 동일 알림을 검사한다. 회원 검증/예약·DB 저장은 fixture이며 실제 계정·FE3D 검수가 아니다.
