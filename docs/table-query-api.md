# 테이블 목록 조회 API

DB 없는 `local` 개발용 API다. 개발 화면에서 현재 테이블과 빈자리를 확인할 때 사용한다. 정식 인증과 DB 연결은 별도 작업이다.

| 항목 | 값 |
| --- | --- |
| Method | `GET` |
| URL | `/api/v1/tables` |
| 요청 본문·필수 헤더 | 없음 |
| 성공 | `200 OK`, `Content-Type: application/json`, `Cache-Control: no-store` |
| local 외 환경 | `404 Not Found` |

## 응답

```json
{
  "tables": [
    {
      "tableId": "table-1",
      "capacity": 2,
      "minimumPlayers": 2,
      "occupiedSeats": 1,
      "availableSeats": 1,
      "readyCount": 1,
      "allReady": false,
      "status": "WAITING",
      "joinable": true
    }
  ]
}
```

예시는 한 테이블만 표시했다. 현재 서버는 `table-1`, `table-2`를 테이블 ID 오름차순으로 반환한다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| tables | array | 테이블 요약 목록. 테이블이 없으면 빈 배열 |
| tableId | string | 테이블 식별자. ERD의 게임 세션 ID와 다름 |
| capacity | integer | 좌석 정원. 현재 2 |
| minimumPlayers | integer | 최소 참가 인원. 현재 2 |
| occupiedSeats | integer | 착석 또는 시작 연동 결과 때문에 보존 중인 좌석 수 |
| availableSeats | integer | 정원에서 점유 좌석 수를 뺀 값 |
| readyCount | integer | 점유 좌석 중 준비 상태인 수 |
| allReady | boolean | 현재 2석 모두 착석·준비했는지 |
| status | string | 아래 상태 값 |
| joinable | boolean | 테이블이 대기 상태이고 빈자리가 있는지 |
| gameCode | string 또는 null | 선택한 게임 코드. 미선택·빈 테이블이면 null |

| status | 의미 |
| --- | --- |
| WAITING | 착석·준비 대기. 정원이 차면 joinable=false |
| STARTING | 선택적 시작 연동 검증에서 결과 확인 중. joinable=false |
| REHEARSAL_CONFIRMED | 시작 연동 검증 성공. 실제 경기 진행 상태가 아님. joinable=false |

기본 실행에서는 `WAITING`만 나온다. [시작 연동 검증](game-start-rehearsal.md)을 켰을 때만 나머지 두 상태가 나온다. 호출 확정 후 연결이 끊겨도 결과를 기다리는 좌석은 점유 수에 포함한다. 확정 거절 시 끊긴 좌석을 정리하고 준비를 초기화한다.

## 프론트 사용 흐름

1. 목록을 조회해 테이블과 빈자리를 표시한다.
2. 사용자가 고른 `tableId`로 [TABLE_JOIN](websocket-api.md)을 보낸다.
3. 착석 후에는 WebSocket의 `TABLE_STATE`로 본인 테이블의 좌석·준비를 동기화한다.

목록은 조회 시점의 요약이며 자리를 예약하지 않는다. 조회 후 다른 사람이 먼저 착석할 수 있으므로 실제 `TABLE_JOIN`에서 `TABLE_FULL`, `TABLE_BUSY` 등이 반환될 수 있다. `joinable`은 테이블 기준이며 사용자의 중복 착석 가능 여부까지 보장하지 않는다.

사용자 ID·좌석별 사용자 정보·시작 요청 ID·게임 세션 ID·잔액은 목록에 포함하지 않는다. 요약을 만드는 동안 기존 상태 변경과 같은 잠금을 사용해 한 응답 안에서 수치가 서로 어긋나지 않게 한다. 서버가 재시작하면 메모리 상태는 초기화된다.

개발 화면 `/dev/tables`는 처음 열 때 조회하고 **목록 새로고침**으로 갱신한다. 자동 실시간 목록 전파는 없다. 조회 실패 시 이전 정보임을 표시하고 착석을 막으며, 새로고침 성공 후 다시 선택할 수 있다. 이미 착석한 사용자의 준비·퇴장은 목록 조회 실패와 별개로 계속 동작한다.
