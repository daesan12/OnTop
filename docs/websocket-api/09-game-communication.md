# 경기 통신 상세 명세

현재 코드의 연결부 계약이다. 기존 Notion 양식인 기능·요청·필드·성공 응답·처리 규칙에 맞춰 정리했다. **2026-10-20 [기존 Notion 데이터베이스](https://app.notion.com/p/3fe161842b8680a1b9b1f557d172c826?v=3fe161842b8680aaa3b3000ce341ce27)에 반영하고 7개 상세를 다시 열어 JSON·담당자·진행상황을 대조했다.** 오목·주사위·원카드·거짓말 다리의 입력·상태·관전·복구를 로컬에서 구현·검증했다. 실제 로그인·시작 차감·테이블 배치·DB 정산·운영 적용은 별도다. 20m 거리 검사는 통신부가 수행한다.

공통 URL은 `/ws/tables`, 담당자는 **장대산**(Notion 표시명 **대산 장**), 진행상황은 **완료(로컬 통신 계약)**, 도메인은 **게임**이다. 본문 공통 JSON은 형식 예시다. 게임별 확정 필드는 아래 4종 실행 계약을 따른다.

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

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 완료

### 기능

인증된 사용자 자신의 경기 상태를 한 번 조회합니다. 공통 권한·공개/개인 분리와 4종 엔진 연결을 구현·검증했습니다. 실제 로그인·시작 차감·DB 정산·운영 적용은 별도 범위입니다.

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
      "hand": ["example-card"]
    }
  }
}
```

### 처리 규칙·오류

- 응답은 요청한 연결에만 보내며 requestId를 그대로 돌려줍니다. gameId는 접근 권한의 증명이 아닙니다.
- PLAYER는 본인 개인 정보만, SPECTATOR는 privateState={}만 받습니다. 본문 JSON은 공통 형식 예시이며 내부 필드는 아래 게임별 계약을 따릅니다.
- 같은 연결의 조회는 한 번에 하나입니다. 복구 완료·해당 경기 권한을 확인하며 끊긴 연결의 늦은 결과는 폐기합니다.
- 실제 Gateway가 없으면 GAME_STATE_NOT_CONFIGURED, dev 임시 연결이면 GAME_STATE_AUTH_REQUIRED입니다. 성공 예시는 검증된 계정과 활성 엔진이 필요합니다.
- 오류: INVALID_PAYLOAD, GAME_STATE_PENDING, GAME_STATE_ACCESS_DENIED, GAME_STATE_INVALID, GAME_STATE_UNAVAILABLE, GAME_STATE_STALE, GAME_RECOVERY_REQUIRED. 기존 ERROR 형식이며 상태·내부 예외는 노출하지 않습니다.

## 경기 상태 수신·자동 갱신 · GAME_STATE

**방향** 서버 → 클라이언트 · **담당자** 장대산 · **진행상황** 완료

### 기능

공개 상태와 본인 개인 상태를 연결별로 전송합니다. 4종 엔진의 상태·서버 타이머 변경을 연결별로 전송하며 실제 로그인·DB 정산·운영 적용은 별도입니다.

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
      "hand": ["example-card"]
    }
  }
}
```

### 처리 규칙·오류

- 단건 조회·관전 최초 응답은 요청 ID, 이후 자동 전송은 requestId=null입니다. 진행 경기의 인증·복구 완료 참가자는 별도 구독 없이 받습니다.
- 각 사용자 권한을 확인하고 개별 조회합니다. 다른 참가자의 손패를 공유하지 않으며 내부 userId는 응답 JSON에 넣지 않습니다.
- 입력 확정 또는 서버 내부 GameStateChanged(gameId,version) 이벤트로 갱신합니다. 이 이벤트는 클라이언트 JSON API가 아닙니다. DB 연동 시 커밋 성공 뒤 발행합니다.
- 처리 중 변경은 최신 버전으로 합칩니다. 중간 프레임 전달을 보장하지 않습니다. 낮은 버전은 화면에 덮어쓰지 않습니다. 관전자 권한은 같은 버전 알림에도 재검사합니다.
- 자동 조회 오류는 해당 연결에 requestId=null의 ERROR로 보냅니다. 관전 오류는 구독도 제거합니다. 종료 상태는 게임별 계약을 따릅니다. 실제 정산·다중 서버 전달은 별도입니다.

## 경기 입력 전달 · GAME_ACTION_SEND

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 완료

### 기능

서버가 확인한 참가자의 행동을 게임 담당에게 전달합니다. 4종 엔진이 규칙·차례·버전·중복 행동을 검증합니다. 실제 로그인·시작 차감·DB 정산은 별도입니다.

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
| payload | object | gameId:1~120자, actionId:1~64자(공백만 불가), expectedVersion:0~9007199254740991 정수, input:JSON 객체. x는 공통 형식 예시이며 실제 input은 아래 게임별 계약을 따릅니다. |
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
- 오목 흑의 33·44·장목은 GAME_ACTION_FORBIDDEN_MOVE로 거절하며 판·버전·차례·턴 마감은 유지한다. 흑 정확한 5목/백 5개 이상 승리와 가짜 3 등 예외는 [오목 실행 계약](../omok.md)을 따른다.
- 오류: INVALID_PAYLOAD, GAME_ACTION_AUTH_REQUIRED, GAME_ACTION_NOT_CONFIGURED, GAME_RECOVERY_REQUIRED, GAME_ACTION_PENDING, GAME_ACTION_ACCESS_DENIED, GAME_ACTION_INVALID_ACTION, GAME_ACTION_FORBIDDEN_MOVE, GAME_ACTION_NOT_YOUR_TURN, GAME_ACTION_STALE_VERSION, GAME_ACTION_ACTION_ID_CONFLICT, GAME_ACTION_INVALID, GAME_ACTION_UNAVAILABLE. dev는 AUTH_REQUIRED가 정상입니다.

## 경기 입력 처리 확인 · GAME_ACTION_RESULT

**방향** 서버 → 클라이언트 · **담당자** 장대산 · **진행상황** 완료

### 기능

접수된 행동의 처리 확인을 요청자에게만 보냅니다. 4종 엔진 연결을 구현·검증했습니다. 실제 로그인·시작 차감·DB 정산·운영 적용은 별도 범위입니다.

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
- 입력이 반영되면 진행 경기 참가자와 권한이 확인된 관전자에게 각자의 GAME_STATE를 보냅니다. GAME_STATE는 GAME_ACTION_RESULT보다 먼저 도착할 수 있으므로 처리 확인은 requestId/actionId, 상태는 version으로 독립 처리합니다.
- 연결 종료 후 도착한 응답은 새 연결로 넘기지 않습니다. 엔진 예외 시 성공/실패를 추측하거나 새 행동 ID로 자동 재시도하지 않습니다.
- 실패는 GAME_ACTION_RESULT 대신 ERROR입니다. GAME_ACTION_SEND 상세 오류를 따르며 실제 엔진 성공·정산 완료를 의미하는 개발용 가짜 응답은 제공하지 않습니다.

## 경기 관전 시작 · GAME_WATCH

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 완료

### 기능

관전 권한을 확인하고 경기의 공개 상태 갱신을 구독합니다. 4종 엔진의 공개 상태에 20m 거리 검사를 적용합니다. 실제 맵 배치·로그인·DB 정산·운영 적용은 별도입니다.

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

**방향** 클라이언트 → 서버 · **담당자** 장대산 · **진행상황** 완료

### 기능

현재 연결의 경기 관전 구독을 해제합니다. 연결부 구현 완료, 4종 엔진 연결을 구현·검증했습니다. 실제 로그인·시작 차감·DB 정산·운영 적용은 별도 범위입니다.

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

**방향** 서버 → 클라이언트 · **담당자** 장대산 · **진행상황** 완료

### 기능

관전 구독의 정상 해제를 알려 프론트의 구독 표시를 종료합니다. 4종 엔진 연결을 구현·검증했습니다. 실제 로그인·시작 차감·DB 정산·운영 적용은 별도 범위입니다.

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

현재 거리 계약: [채팅·관전 기본 20m](../world-proximity.md)를 함께 적용합니다. 실제 테이블 좌표는 설정 전이며, 위치·좌표·내부 경기 tableId가 없으면 관전을 허용하지 않습니다. 기존 JSON 형식은 유지합니다.

## 오목 실제 입력

오목의 input은 x/y 두 필드만 허용하며 각각 0~14 정수인 판 좌표입니다. 예: `{"x":7,"y":7}`. 15×15 렌주·흑 선공·흑 정확히5목/백5개이상 승리·흑33/44/장목 금수, 한 수 30초 도달 시 시간패·총시간 제한 없음입니다. 복귀해도 기존 턴 마감을 유지합니다. 상태 필드·서버 내부 경기 생성·정산 경계는 [오목 계약](../omok.md)을 따릅니다.

## 주사위 실제 입력

주사위(DICE)의 input은 `{kind:"roll" 또는 "bank",selectedIds:[0~5의 중복 없는 ID]}`만 허용합니다. 첫 굴림은 [], 이후 재굴림/Bank는 현재 공개 dice의 held=false 득점 조합을 선택합니다. 서버가 점수·난수·승패를 판정합니다. 한 차례 전체30초, 재굴림·거절·재접속으로 연장하지 않습니다. 만료 시 저장 총점을 유지하고 이번턴만 잃은 뒤 차례를 넘깁니다. 목표2000/4000/6000을 Bank로 달성하면 즉시승리·추가턴없음. 전체 점수표·상태·생성/정산 경계는 [주사위 계약](../farkle.md)을 따릅니다.

## 원카드 실제 입력

원카드(ONE_CARD)는 play(cardId), draw, accept-attack, select-suit(suit), declare-one, catch-one(targetUserId) 여섯 kind를 사용합니다. 손패는 본인 privateState에만 전달하며 cardId는 거기서 선택합니다. 한 차례30초 후 일반1장/공격누적장수를 받고 넘깁니다. K·무늬선택·복귀는 기존 마감 유지, 선언/신고는 별도3초 반응창입니다. 기권 손패 정책은 확인 대기이며 기본값 없이 명시 설정이 필요합니다. 입력·공개/개인 상태·효과·활성화 조건은 [원카드 계약](../onecard.md)을 따릅니다.

## 거짓말 다리 실제 입력

LIAR_BRIDGE는 roll, declare(value:1~4), trust, doubt를 현재 단계·판단자·최신 버전으로 보냅니다. 굴림/선언/각 판단30초, 앞의 둘은 만료시 차례 넘김, 판단은 믿고 다음 판단자입니다. 눈은 본인에게만 전송하고 모두 믿으면 공개하지 않습니다. 다우트 때만 공개하며 판정 연출1.5초 동안 입력을 막습니다. 상태·골인 슬롯·기권·정산 경계는 [다리 계약](../bridge.md)을 따릅니다.
