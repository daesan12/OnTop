# 경기 통신 상세 명세 · Notion 게시 대기

현재 코드의 연결부 계약이다. 기존 Notion 양식인 기능·요청·필드·성공 응답·처리 규칙에 맞춰 정리했다. **Notion에는 아직 게시하지 않았다.** 실제 로그인·경기 엔진·거리 기반 관전 권한·종료/정산은 연동 대기다.

공통 URL은 `/ws/tables`, 담당자는 **장대산**(Notion 표시명 **대산 장**), 게시 시 진행상황은 **진행 중**, 도메인은 **게임**이다. 응답 필드는 형식 예시이며 게임별 확정 상태가 아니다.

세부 연동 경계와 오류 의미는 [경기 상태 계약](../game-state-api.md), [경기 입력 계약](../game-action-api.md)을 따른다.

| 기능 | 메시지 | 방향 |
| --- | --- | --- |
| 경기 상태 조회 | GAME_STATE_CHECK | 클라이언트 → 서버 |
| 경기 상태 수신·자동 갱신 | GAME_STATE | 서버 → 클라이언트 |
| 경기 입력 전달 | GAME_ACTION_SEND | 클라이언트 → 서버 |
| 경기 입력 처리 확인 | GAME_ACTION_RESULT | 서버 → 클라이언트 |
| 경기 관전 시작 | GAME_WATCH | 클라이언트 → 서버 |
| 경기 관전 종료 | GAME_UNWATCH | 클라이언트 → 서버 |
| 경기 관전 종료 알림 | GAME_WATCH_LEFT | 서버 → 클라이언트 |

## 경기 상태 조회 · GAME_STATE_CHECK

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 진행 중

### 기능

인증된 사용자 자신의 경기 상태를 한 번 조회합니다. 연결부 구현 완료, 실제 로그인·경기 엔진은 연동 대기입니다.

### 요청

```json
{
  "requestId": "state-1",
  "type": "GAME_STATE_CHECK",
  "payload": {
    "gameId": "game-1"
  }
}
```

### 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| payload | object | gameId: 공백이 아닌 1~120자 문자열. 사용자·역할은 서버가 확인하며 요청에 넣지 않습니다. |
| requestId (최상위) | string · 필수 | 공백이 아닌 1~64자 문자열. null이면 INVALID_MESSAGE. payload 안에 넣지 않습니다. |

### 성공 응답

```json
{
  "requestId": "state-1",
  "type": "GAME_STATE",
  "payload": {
    "gameId": "game-1",
    "version": 8,
    "role": "PLAYER",
    "publicState": {
      "turnUserId": "101"
    },
    "privateState": {
      "hand": [
        "example-card"
      ]
    }
  }
}
```

### 처리 규칙·오류

- 응답은 요청한 연결에만 보내며 requestId를 그대로 돌려줍니다. gameId는 접근 권한의 증명이 아닙니다.
- PLAYER는 본인 개인 정보만, SPECTATOR는 privateState={}만 받습니다. publicState/privateState 내부 필드는 게임 담당이 확정할 예시입니다.
- 같은 연결의 조회는 한 번에 하나입니다. 복구 완료·해당 경기 권한을 확인하며 끊긴 연결의 늦은 결과는 폐기합니다.
- 실제 Gateway가 없으면 GAME_STATE_NOT_CONFIGURED, dev 임시 연결이면 GAME_STATE_AUTH_REQUIRED입니다. 성공 예시는 인증·엔진 연동 후 사용합니다.
- 오류: INVALID_PAYLOAD, GAME_STATE_PENDING, GAME_STATE_ACCESS_DENIED, GAME_STATE_INVALID, GAME_STATE_UNAVAILABLE, GAME_STATE_STALE, GAME_RECOVERY_REQUIRED. 기존 ERROR 형식이며 상태·내부 예외는 노출하지 않습니다.

## 경기 상태 수신·자동 갱신 · GAME_STATE

**방향** 서버 → 클라이언트 · **담당자** 장대산 · **진행상황** 진행 중

### 기능

공개 상태와 본인 개인 상태를 연결별로 전송합니다. 연결부 구현 완료, 실제 엔진·로그인은 연동 대기입니다.

### 발생 요청 예시

```json
{
  "requestId": "state-1",
  "type": "GAME_STATE_CHECK",
  "payload": {
    "gameId": "game-1"
  }
}
```

### 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| payload | object | gameId:string, version:0 이상 정수, role:PLAYER/SPECTATOR, publicState:object, privateState:object. SPECTATOR의 개인 상태는 반드시 {}. |
| requestId (최상위) | string 또는 null | 요청에 대한 응답이면 원래 요청 ID, 서버 자동 알림이면 null. payload 안에 넣지 않습니다. |

### 수신 예시

```json
{
  "requestId": null,
  "type": "GAME_STATE",
  "payload": {
    "gameId": "game-1",
    "version": 8,
    "role": "PLAYER",
    "publicState": {
      "turnUserId": "101"
    },
    "privateState": {
      "hand": [
        "example-card"
      ]
    }
  }
}
```

### 처리 규칙·오류

- 단건 조회·관전 최초 응답은 요청 ID, 이후 자동 전송은 requestId=null입니다. 진행 경기의 인증·복구 완료 참가자는 별도 구독 없이 받습니다.
- 각 사용자 권한을 확인하고 개별 조회합니다. 다른 참가자의 손패를 공유하지 않으며 내부 userId는 응답 JSON에 넣지 않습니다.
- 입력 확정 또는 서버 내부 GameStateChanged(gameId,version) 이벤트로 갱신합니다. 이 이벤트는 클라이언트 JSON API가 아닙니다. DB 연동 시 커밋 성공 뒤 발행합니다.
- 처리 중 변경은 최신 버전으로 합칩니다. 중간 프레임 전달을 보장하지 않습니다. 낮은 버전은 화면에 덮어쓰지 않습니다. 관전자 권한은 같은 버전 알림에도 재검사합니다.
- 자동 조회 오류는 해당 연결에 requestId=null의 ERROR로 보냅니다. 관전 오류는 구독도 제거합니다. 종료·정산·다중 서버 전달·실제 필드 구성은 미연결입니다.

## 경기 입력 전달 · GAME_ACTION_SEND

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 진행 중

### 기능

서버가 확인한 참가자의 행동을 게임 담당에게 전달합니다. 연결부 구현 완료, 실제 규칙 판정·엔진은 연동 대기입니다.

### 요청

```json
{
  "requestId": "action-1",
  "type": "GAME_ACTION_SEND",
  "payload": {
    "gameId": "game-1",
    "actionId": "action-1",
    "expectedVersion": 8,
    "input": {
      "x": 3
    }
  }
}
```

### 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| payload | object | gameId:1~120자, actionId:1~64자(공백만 불가), expectedVersion:0~9007199254740991 정수, input:JSON 객체. x는 형식 예시이며 게임별 필드는 미확정. |
| requestId (최상위) | string · 필수 | 공백이 아닌 1~64자 문자열. null이면 INVALID_MESSAGE. payload 안에 넣지 않습니다. |

### 성공 응답

```json
{
  "requestId": "action-1",
  "type": "GAME_ACTION_RESULT",
  "payload": {
    "gameId": "game-1",
    "actionId": "action-1",
    "version": 9
  }
}
```

### 처리 규칙·오류

- 인증·해당 경기 복구 완료·조작권을 확인합니다. 관전·다른 경기의 입력을 전달하지 않습니다. 턴·게임 규칙·버전은 엔진이 변경과 함께 다시 검사합니다.
- requestId는 응답 연결용, actionId는 행동 식별용입니다. 새 행동은 새 ID, 같은 행동의 재확인은 같은 actionId·expectedVersion·input을 유지합니다.
- 중복 반영 방지는 경기 담당 책임입니다. (userId,gameId,actionId)의 같은 내용은 기존 결과, 다른 내용은 충돌이어야 합니다. 연결부 자체에 영속 중복 제거는 없습니다.
- 동일 연결 입력은 한 번에 하나입니다. 엔진 전달 후 끊겨도 행동을 취소하지 않습니다. 예외·잘못된 결과는 반영 여부가 불명이므로 자동 재전송하지 말고 상태를 조회합니다.
- 오류: INVALID_PAYLOAD, GAME_ACTION_AUTH_REQUIRED, GAME_ACTION_NOT_CONFIGURED, GAME_RECOVERY_REQUIRED, GAME_ACTION_PENDING, GAME_ACTION_ACCESS_DENIED, GAME_ACTION_INVALID_ACTION, GAME_ACTION_NOT_YOUR_TURN, GAME_ACTION_STALE_VERSION, GAME_ACTION_ACTION_ID_CONFLICT, GAME_ACTION_INVALID, GAME_ACTION_UNAVAILABLE. dev는 AUTH_REQUIRED가 정상입니다.

## 경기 입력 처리 확인 · GAME_ACTION_RESULT

**방향** 서버 → 클라이언트 · **담당자** 장대산 · **진행상황** 진행 중

### 기능

접수된 행동의 처리 확인을 요청자에게만 보냅니다. 실제 경기 엔진 연동 대기입니다.

### 발생 요청 예시

```json
{
  "requestId": "action-1",
  "type": "GAME_ACTION_SEND",
  "payload": {
    "gameId": "game-1",
    "actionId": "action-1",
    "expectedVersion": 8,
    "input": {
      "x": 3
    }
  }
}
```

### 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| payload | object | gameId:string, actionId:string, version:처리 후 경기 버전. 입력 원문·개인 상태는 포함하지 않습니다. |
| requestId (최상위) | string 또는 null | 요청에 대한 응답이면 원래 요청 ID, 서버 자동 알림이면 null. payload 안에 넣지 않습니다. |

### 수신 예시

```json
{
  "requestId": "action-1",
  "type": "GAME_ACTION_RESULT",
  "payload": {
    "gameId": "game-1",
    "actionId": "action-1",
    "version": 9
  }
}
```

### 처리 규칙·오류

- requestId는 GAME_ACTION_SEND의 요청 ID입니다. 요청자에게만 보내며 다른 사용자에게 방송하지 않습니다.
- 수신 후 GAME_STATE에서 실제 공개·개인 상태를 갱신합니다. GAME_STATE_CHECK로도 재확인할 수 있습니다.
- 성공 확정 뒤 진행 경기 참가자와 권한이 확인된 관전자에게 각자의 GAME_STATE를 보냅니다.
- 연결 종료 후 도착한 응답은 새 연결로 넘기지 않습니다. 엔진 예외 시 성공/실패를 추측하거나 새 행동 ID로 자동 재시도하지 않습니다.
- 실패는 GAME_ACTION_RESULT 대신 ERROR입니다. GAME_ACTION_SEND 상세 오류를 따르며 실제 엔진 성공·정산 완료를 의미하는 개발용 가짜 응답은 제공하지 않습니다.

## 경기 관전 시작 · GAME_WATCH

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 진행 중

### 기능

관전 권한을 확인하고 경기의 공개 상태 갱신을 구독합니다. 연결부 구현 완료, 맵·거리 권한 판정과 실제 엔진은 연동 대기입니다.

### 요청

```json
{
  "requestId": "watch-1",
  "type": "GAME_WATCH",
  "payload": {
    "gameId": "game-1"
  }
}
```

### 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| payload | object | gameId:공백이 아닌 1~120자 문자열. userId/role 등 추가 필드는 허용하지 않습니다. |
| requestId (최상위) | string · 필수 | 공백이 아닌 1~64자 문자열. null이면 INVALID_MESSAGE. payload 안에 넣지 않습니다. |

### 성공 응답

```json
{
  "requestId": "watch-1",
  "type": "GAME_STATE",
  "payload": {
    "gameId": "game-1",
    "version": 8,
    "role": "SPECTATOR",
    "publicState": {
      "turnUserId": "101"
    },
    "privateState": {}
  }
}
```

### 처리 규칙·오류

- 현재 인증 계정이며 로비 사용이 가능해야 합니다. 경기 참가·복구 중 연결은 GAME_RECOVERY_REQUIRED입니다. TABLE_WATCH는 경기 관전 권한을 주지 않습니다.
- Gateway가 현재 관전 자격과 SPECTATOR 역할·빈 privateState를 확인해야 합니다. 최초 GAME_STATE는 요청 ID, 이후 갱신은 null입니다.
- 연결 하나에 대기 중 요청을 포함해 경기 하나만 구독합니다. 중복은 GAME_ALREADY_WATCHING, 변경 전 GAME_UNWATCH가 필요합니다.
- 각 변경에서 자격을 재검사합니다. 실패/권한 거절이면 ERROR 후 구독을 제거합니다. 재접속 시 자동 구독하지 않습니다. 참가자 전환 시 GAME_WATCH_LEFT(null)로 종료합니다.
- 오류: INVALID_PAYLOAD, GAME_STATE_AUTH_REQUIRED, GAME_STATE_NOT_CONFIGURED, GAME_STATE_PENDING, GAME_STATE_ACCESS_DENIED, GAME_STATE_INVALID, GAME_STATE_UNAVAILABLE, GAME_STATE_STALE, GAME_RECOVERY_REQUIRED, GAME_ALREADY_WATCHING, GAME_WATCH_CANCELLED. 최초 확인 전 해제하면 원래 요청에 CANCELLED를 응답합니다.

## 경기 관전 종료 · GAME_UNWATCH

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 진행 중

### 기능

현재 연결의 경기 관전 구독을 해제합니다. 연결부 구현 완료, 실제 경기 엔진 연동 대기입니다.

### 요청

```json
{
  "requestId": "unwatch-1",
  "type": "GAME_UNWATCH",
  "payload": {}
}
```

### 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| payload | object | payload:빈 객체 {}만 허용합니다. gameId/userId 등 추가 필드는 넣지 않습니다. |
| requestId (최상위) | string · 필수 | 공백이 아닌 1~64자 문자열. null이면 INVALID_MESSAGE. payload 안에 넣지 않습니다. |

### 성공 응답

```json
{
  "requestId": "unwatch-1",
  "type": "GAME_WATCH_LEFT",
  "payload": {
    "gameId": "game-1"
  }
}
```

### 처리 규칙·오류

- 현재 연결의 관전만 해제합니다. 참가자 입력·복구·TABLE_WATCH 대기 구독은 바꾸지 않습니다.
- 성공은 요청 ID가 있는 GAME_WATCH_LEFT입니다. 구독이 없으면 GAME_NOT_WATCHING입니다.
- 최초 GAME_WATCH 조회 중 해제하면 원래 watch 요청에는 GAME_WATCH_CANCELLED, unwatch 요청에는 GAME_WATCH_LEFT를 보냅니다.
- 해제 후 늦게 도착한 상태는 폐기합니다. 실행 중 엔진 호출을 강제 취소하지 않으며 재구독 시에도 자동 조회가 중첩되지 않습니다.
- 오류: INVALID_PAYLOAD, GAME_NOT_WATCHING. 기본 dev 연결에서 먼저 구독하지 않았다면 GAME_NOT_WATCHING이 정상입니다.

## 경기 관전 종료 알림 · GAME_WATCH_LEFT

**방향** 서버 → 클라이언트 · **담당자** 장대산 · **진행상황** 진행 중

### 기능

관전 구독의 정상 해제를 알려 프론트의 구독 표시를 종료합니다. 실제 경기 엔진 연동 대기입니다.

### 발생 요청 예시

```json
{
  "requestId": "unwatch-1",
  "type": "GAME_UNWATCH",
  "payload": {}
}
```

### 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| payload | object | gameId:해제된 경기 ID 문자열. |
| requestId (최상위) | string 또는 null | 요청에 대한 응답이면 원래 요청 ID, 서버 자동 알림이면 null. payload 안에 넣지 않습니다. |

### 수신 예시

```json
{
  "requestId": "unwatch-1",
  "type": "GAME_WATCH_LEFT",
  "payload": {
    "gameId": "game-1"
  }
}
```

### 처리 규칙·오류

- GAME_UNWATCH 성공 시 원래 요청 ID를 돌려줍니다. 이전 구독의 상태를 더 이상 화면에 적용하지 않습니다.
- 로비 자격 상실·참가자 전송으로의 전환은 성립한 구독에 requestId=null로 알립니다. 최초 대기 요청은 GAME_RECOVERY_REQUIRED 오류입니다.
- 권한/엔진 오류는 GAME_WATCH_LEFT 대신 ERROR 후 구독을 제거합니다. 프론트는 관련 ERROR에도 구독 표시를 해제해야 합니다.
- 연결 종료는 별도 해제 메시지 없이 서버 메모리 구독을 제거합니다. 새 연결에서 필요한 경우 GAME_WATCH를 다시 요청합니다.
- GAME_WATCH_LEFT는 경기 종료·정산 결과가 아닙니다. GAME_NOT_WATCHING 등 요청 오류는 ERROR 형식을 따릅니다.
