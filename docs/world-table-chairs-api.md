# 승인 의자 수·채널별 동적 충돌

2026-10-29 FE 요청 기준. 로컬 구현이며 공용 서버 적용·FE 새 필드 연결은 별도다.
기존 정적 맵 파일·mapVersion·서버 tableId/anchorId 바인딩은 유지한다.

공개 의자 수 = max(2, 서버 승인 selectedPlayers 또는2, 현재 점유한 최대1-based seatNumber).
미설정/2인은1·2번,3인은1~3번,4인은전부 충돌한다. 설정 초기화·좌석 재배치·퇴장·게임 종료/다음 판에서도
현재 상태로 재계산하며 점유한 높은 번호의 의자를 숨기지 않는다. 기존 탁자/기둥/시설 충돌은 유지한다.

WORLD_STATE의 기존 channelId/version/avatars/mapVersion에 tables 전체 목록을 추가한다.

```json
{
  "requestId": null,
  "type": "WORLD_STATE",
  "payload": {
    "channelId": "channel-1",
    "version": 42,
    "mapVersion": "기존 서버 mapVersion",
    "avatars": [],
    "tables": [
      {
        "tableId": "서버 발급 ID",
        "anchorId": "table-5",
        "chairCount": 3
      }
    ]
  }
}
```

이 예시의 avatars는 생략 설명용 빈 목록이며 실제 응답은 기존 아바타 전체를 유지한다. 준비·판돈·손패·참가자
비공개 상태는 tables에 넣지 않는다. 같은 채널의 모든 맵 확인 완료 사용자에게 바뀐 상태를 즉시 보내고,
늦은 입장/재접속은 현재 전체 목록을 받는다. 기존 WORLD_STATE.version 순서/낮은 버전 무시 규칙을 따른다.
GET /api/v1/tables?channelId=... 의 각 항목에도 chairCount를 추가하고 기존 필드/승인 설정은 유지한다.

물리는 anchorId의 `<anchor>-chair-0..3` 몸체를 한 번만 등록하고 활성화 여부만 바꾼다. 충돌 접미사0은 공개1번이다.
채널마다 독립된 물리 공간을 사용한다. 새 의자와 겹친 미착석자는 같은 높이의 가까운 지지면/빈 공간을
최대4m까지 탐색해 서버가 안전 이동한다. 주변에 안전 공간이 없으면 기존 검증된 복구 위치/스폰을 사용한다.
이전 입력을 폐기하고 승인 위치를 같은 WORLD_STATE에 반영한다. 착석자의 자세는 이동시키지 않는다.

검증: WorldChairPhysicsTests(실제 Bullet 통과/차단·2→3→4→2·겹침 안전 이동·채널 공간 분리),
WorldPublicTablesActivityTests(늦은 입장/복귀·채널 상태), LegacyParkTableFlowTests(실제 Hub와 산책자 송신 큐).
게임 시작/정산 경계는 일부 테스트 대역이며 실제 두 브라우저 3D 통행 검수와 구분한다.
