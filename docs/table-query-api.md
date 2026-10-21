# 테이블 목록 조회 API

`local`의 현재 테이블·빈자리 조회 API다. `ontop.websocket.authenticated=true`에서는 기존 로그인 Access JWT·활성 계정 인증을 연결한다. 기본 개발 모드(false)의 무인증 조회는 개발 화면 검증용으로 유지한다. DB 차감·경기 저장과 별개다.

## 로그인부터 착석까지

1. 로그인 후 `Authorization: Bearer <Access JWT>`로 채널 목록을 조회한다.
2. 선택한 `channelId`로 이 GET을 호출하고 응답의 서버 `tableId`를 사용한다. 읽기만으로 입장·예약·착석하지 않는다.
3. 접속권 발급 → WebSocket 연결 → CHANNEL_JOIN → TABLE_JOIN → GAME_SELECT → READY_SET.
4. 같은 GET을 다시 호출하면 착석·준비·퇴장·heartbeat 종료의 공개 요약이 반영된다. 조회 시점의 빈자리이며 실제 착석 때 다시 검사한다.

인증 모드의 GET/OPTIONS는 기존 `ChannelAccessFilter`가 채널 조회와 같은 JWT 서명·만료·활성 계정 확인 및 허용 Origin 정책을 적용한다. 토큰 URL·userId 쿼리·X-User-Id·접속권·온보딩 토큰을 인증으로 사용하지 않는다. 기존 서버 Principal은 유지하지만 명시한 Authorization은 반드시 검증한다. DB 계정 어댑터는 `local,db`가 필요하다. GET은 접속권을 소비하지 않는다.

허용 Origin의 GET/Authorization 프리플라이트는204. 성공·오류 모두 no-store, 허용 출처 CORS 헤더를 유지한다. 미인증/만료/위조/비활성401 UNAUTHENTICATED, 출처/프리플라이트 거절403 FORBIDDEN, JWT 설정·계정 조회 장애503 SERVICE_UNAVAILABLE이며 내부 예외는 노출하지 않는다. 인증을 먼저 확인하므로 무인증 채널 누락 요청도401이다. 개발 모드의 기존 GET·오류 계약은 유지한다.

| 항목 | 값 |
| --- | --- |
| Method | `GET` |
| URL | `/api/v1/tables` |
| 요청 본문·필수 헤더 | Body 없음. 인증 모드는 Authorization 필수. 채널 설정 환경에서는 Query `channelId` 필수 |
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
      "joinable": true,
      "gameCode": "OMOK"
    }
  ]
}
```

예시는 채널 설정 없는 기존 개발 모드다. 이때 `table-1`, `table-2`를 ID 순으로 반환한다.

채널을 설정했다면 `GET /api/v1/tables?channelId=channel-1`로 해당 채널의 테이블만 조회한다.

채널마다 검증용 테이블 2개를 독립 생성하고 ID 순으로 반환한다. 최종 제품의 테이블 수·배치를 확정한 값이 아니다. `tableId`는 채널 사이에서도 다른 서버 발급 문자열(`table-UUID`)이며 프론트가 만들거나 해석하지 않고 조회 응답을 그대로 TABLE_JOIN에 사용한다. 상태·좌석·게임 선택·시작 결과는 이 ID로 분리된다.

| HTTP | code | 조건 |
| --- | --- | --- |
| 400 | CHANNEL_REQUIRED | 채널이 설정됐는데 channelId 누락·공백 |
| 404 | CHANNEL_NOT_FOUND | 등록되지 않은 channelId |

오류 본문은 `{code,message,details:null}`이며 성공·오류 모두 `Cache-Control: no-store`다. 위 채널 오류는 인증 모드에서 인증을 통과한 뒤 적용한다. 채널 목록의 항상 인증 필수 정책은 바꾸지 않는다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| tables | array | 테이블 요약 목록. 테이블이 없으면 빈 배열 |
| tableId | string | 테이블 식별자. ERD의 게임 세션 ID와 다름 |
| capacity | integer | 미선택 4, 오목·주사위 2, 원카드·거짓말 4 |
| minimumPlayers | integer | 최소 참가 인원. 현재 2 |
| occupiedSeats | integer | 착석 또는 시작 연동 결과 때문에 보존 중인 좌석 수 |
| availableSeats | integer | 정원에서 점유 좌석 수를 뺀 값 |
| readyCount | integer | 점유 좌석 중 준비 상태인 수 |
| allReady | boolean | 게임 선택·최소 2명 충족, 현재 착석자 모두 준비. 빈 좌석 제외 |
| status | string | 아래 상태 값 |
| joinable | boolean | 테이블이 대기 상태이고 빈자리가 있는지 |
| gameCode | string 또는 null | 선택한 게임 코드. 미선택·빈 테이블이면 null |

| status | 의미 |
| --- | --- |
| WAITING | 착석·준비 대기. 정원이 차면 joinable=false |
| STARTING | 선택적 시작 연동 검증에서 결과 확인 중. joinable=false |
| REHEARSAL_CONFIRMED | 시작 연동 검증 성공. 실제 경기 진행 상태가 아님. joinable=false |
| PLAYING | 별도 인증 시작 모드에서 B 확정 성공 후 엔진 생성. joinable=false |

기본 실행에서는 `WAITING`만 나온다. 개발 [시작 연동 검증](game-start-rehearsal.md)은 `STARTING`·`REHEARSAL_CONFIRMED`, 별도 [인증 시작 모드](committed-game-start.md)는 `STARTING`·`PLAYING`을 반환한다. 호출 확정 후 연결이 끊겨도 결과를 기다리는 좌석은 점유 수에 포함한다. 확정 거절 시 끊긴 좌석을 정리하고 준비를 초기화한다.

## 프론트 사용 흐름

1. 채널 설정 환경에서는 해당 channelId로 목록을 조회하고 CHANNEL_JOIN 성공 후 착석한다.
2. 사용자가 고른 `tableId`로 [TABLE_JOIN](websocket-api.md)을 보낸다. 서버는 현재 연결의 채널과 테이블 소속을 대조한다. 미입장은 NOT_IN_CHANNEL, 다른 채널은 TABLE_CHANNEL_MISMATCH다.
3. 착석 후에는 WebSocket의 `TABLE_STATE`로 본인 테이블의 좌석·준비를 동기화한다.

목록은 조회 시점의 요약이며 자리를 예약하지 않는다. 조회 후 다른 사람이 먼저 착석할 수 있으므로 실제 `TABLE_JOIN`에서 `TABLE_FULL`, `TABLE_BUSY` 등이 반환될 수 있다. `joinable`은 테이블 기준이며 사용자의 중복 착석 가능 여부까지 보장하지 않는다.

사용자 ID·좌석별 사용자 정보·시작 요청 ID·게임 세션 ID·잔액은 목록에 포함하지 않는다. 요약을 만드는 동안 기존 상태 변경과 같은 잠금을 사용해 한 응답 안에서 수치가 서로 어긋나지 않게 한다. 서버가 재시작하면 메모리 상태는 초기화된다.

개발 화면 `/dev/tables`는 채널 선택·입장 후 해당 채널의 테이블을 조회한다. 채널 설정이 없으면 기존 개발 모드를 유지한다. 이 화면은 처음 열 때 조회하고 **목록 새로고침**으로 갱신한다. 자동 실시간 목록 전파는 없다. 조회 실패 시 이전 정보임을 표시하고 착석을 막으며, 새로고침 성공 후 다시 선택할 수 있다. 이미 착석한 사용자의 준비·퇴장은 목록 조회 실패와 별개로 계속 동작한다.
