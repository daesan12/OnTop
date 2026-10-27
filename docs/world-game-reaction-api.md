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
| gameCode / version | 기존 게임 코드·확정된 엔진 상태 버전 |
| userId | 연출 대상 회원 ID 문자열 |
| kind | FORFEIT=참가 자격 상실, DEFEAT=최종 일반 패배 |
| remainingBefore | 해당 판정 직전에 참가 자격이 남아 있던 인원. 시작 인원/말 개수가 아님 |
| motion / durationMs | 2명이면 table-flip/2800, 나머지는 head-clutch/3600 |
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

`feat/frontend-defeat-motion`의 기존 구현은 GAME_STATE 변화에서 추론하는 경로다.
이 공개 알림 수신 연결은 FE 후속 작업이며 서버 코드 추가만으로 주변 3D 모션이 연결됐다고 보지 않는다.
개발 API 주소는 `https://dev-api.on-top.world`, WS는 `wss://dev-api.on-top.world/ws/tables`지만
이번 로컬 커밋은 아직 푸시/배포하지 않았다. 배포 확인 후 기존 로그인·1회용 접속권으로 공동 검수한다.

## 검증

GameDefeatTests/GameLifecycleTests는 4종 엔진·직전 인원·pendingForfeit·일반 패배·중복/무승부를 검사한다.
WorldGameReactionTests는 현재 경기 대조·20m/20.01m·채널 격리·비구독자·재접속을 Hub 송신 큐에서 검사한다.
WorldGameReactionFlowTests는 별도 Spring 서버에서 실제 오목 시간패→EventListener→RawWS의
참가자/관전자/비구독자 동일 알림을 검사한다. 회원 검증/예약·DB 저장은 fixture이며 실제 계정·FE3D 검수가 아니다.
