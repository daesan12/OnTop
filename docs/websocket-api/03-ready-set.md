# ✅ 준비·준비 취소

> **READY_SET** · 클라이언트 → 서버

| 항목 | 내용 |
| --- | --- |
| 도메인 | 테이블 |
| 진행상황 | 로컬 검증 완료 |
| 방식 | WebSocket |
| URL | `/ws/tables` |
| 요청 요약 | true는 확인한 참가비·TABLE_STATE 버전 필수, false는 기존 ready만 사용 |
| 응답·알림 요약 | TABLE_STATE / ERROR |
| 수신 대상 | 요청자·같은 테이블 참가자 |

### 요청

```json
{
  "requestId": "req-002",
  "type": "READY_SET",
  "payload": {
    "ready": true,
    "betAmountPerPlayer": 5,
    "expectedVersion": 12
  }
}
```

| payload 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `ready` | boolean | O | 준비 true, 준비 취소 false |
| `betAmountPerPlayer` | integer | true일 때 필수 | 화면에서 확인한 서버 확정 참가비. 양의 정수 |
| `expectedVersion` | integer | true일 때 필수 | 해당 참가비를 확인한 TABLE_STATE.version. 0 이상 안전 정수 |

문자열 `"true"`, 숫자 1, null은 허용하지 않습니다. 현재 연결의 사용자와 착석 테이블을 서버에서 확인하므로 tableId·userId를 보내지 않습니다.
true는 세 필드만, false는 `{"ready":false}`만 허용합니다. 요청 필드를 생략해 서버가 금액을 추정하지 않습니다.

### 참가비 동의 및 늦은 요청

- true는 현재 참가비와 일치해야 합니다. 검증과 준비 상태 변경을 같은 TableHub 잠금 안에서 수행합니다.
- expectedVersion은 마지막 전원 준비 초기화 시점 이상, 현재 TABLE_STATE.version 이하이어야 합니다.
  기존 버전의 시점을 내부에 보관하며 별도 공개 설정 버전이나 DB 필드는 추가하지 않습니다.
- 참가비·게임·목표 변경 및 참가자 변경은 전원 준비를 초기화합니다. 100→500→100으로 돌아와도
  처음 100에 동의한 오래된 요청은 거절합니다. 다른 사용자의 단순 준비/취소로 증가한 버전은 동의를 무효화하지 않습니다.
- 설정 동의 ERROR 시 기존 준비·참가비·버전을 바꾸지 않습니다. FE는 새 TABLE_STATE를 표시하고 다시 동의를 받습니다.
  새 버전으로 자동 재시도하여 사용자 동의를 대신하지 않습니다.

### 성공 처리

- 요청자의 준비 상태만 변경합니다.
- `ready=true`는 게임·참가비 선택 후 가능합니다. 게임이나 참가비를 바꾸면 다시 확인하고 준비해야 합니다.
- 실제 값이 바뀌면 버전을 1 증가시키고 모든 참가자에게 `TABLE_STATE`를 전송합니다. 요청자 응답만 요청 ID를 포함합니다.
- 이미 같은 값이면 변경 없이 요청자에게 현재 상태를 응답합니다. 버전 증가·다른 참가자 알림은 없습니다.
- 게임별 최소 인원(현재 2명)을 충족하고 현재 착석자 모두 준비하면 `allReady=true`입니다. 원카드·거짓말은 2~4명이 가능하며 빈 좌석은 제외합니다. 한 명은 준비해도 `allReady=false`입니다.
- 전원 준비 상태에서도 준비 취소·퇴장이 가능합니다. 실제 경기 상태로 전환하지 않습니다.

Spring AUTO 시작 연결이 비활성인 경우, 전원 준비가 된 `TABLE_STATE` 뒤에 같은 테이블의 인증된 참가자에게만
`ERROR`를 자동 알립니다. 이때 `requestId=null`, `payload.code=START_NOT_CONFIGURED`입니다.
이는 이미 성공한 준비 요청의 실패 응답이 아니며 준비 상태는 유지합니다. 예약·경기를 만들지 않고,
관전자·다른 테이블에는 보내지 않습니다. MANUAL은 방장의 `TABLE_START` 요청 시 같은 오류를
해당 요청 ID로 반환합니다. 서버 로그만 남긴 채 시작을 무기한 기다리게 하지 않도록 구분합니다.

### 실패

- `INVALID_PAYLOAD`: ready 누락·타입 오류·허용하지 않은 필드, true의 참가비/expectedVersion 누락 또는 잘못된 형식.
- `NOT_SEATED`: 현재 사용자가 어느 테이블에도 착석하지 않음.
- `GAME_NOT_SELECTED`: 게임 선택 전에 ready=true를 요청함.
- `GAME_BET_CHANGED`: 확인한 참가비와 현재 참가비 불일치.
- `GAME_SETTINGS_CHANGED`: 전원 준비 초기화 이전 버전 또는 미래 버전. 금액이 다시 같아진 경우도 포함.
- `TABLE_BUSY` / `GAME_RECOVERY_REQUIRED`: 기존 진행 경기·복구 선행 조건을 유지.

---

[공통 규격](00-common.md) · [API 목록](../websocket-api.md)

## 새 태블릿 MANUAL 모드

TABLE_CONFIGURE로 MANUAL을 선택하면 선택 정원 전원 준비가 필요하다. 전원 준비만으로 시작하지 않고 방장 TABLE_START를 기다리며 120초 대기 상태를 별도 전송한다. AUTO는 기존 동작 유지. [태블릿 상세](../tablet-lobby-api.md).

## 사용 가능 잔액 사전 확인

- DB 제품 프로필에서 `ready=true`를 승인하기 전에 본인의 `balance - reservedBalance`를 읽어 판돈 이상인지 검사한다. 준비는 차감·예약을 하지 않는다. DB 없는 직접 생성 데모 Hub는 기존 동작을 유지한다.
- 잔액 조회는 Hub 잠금 밖에서 수행한다. 완료 시 같은 접속·좌석·테이블 설정·대기 상태를 재검사한다. 퇴장·준비 취소는 진행 중 검사를 무효화하며 이전 결과를 새 좌석에 적용하지 않는다.
- `INSUFFICIENT_BALANCE`: 준비하지 않고 요청자에게만 판돈·사용 가능 잔액·부족 금액을 안내한다. 이미 준비 중이었다면 해당 준비를 해제한다.
- `READY_BALANCE_UNAVAILABLE`: 조회 장애 또는 5초 내 미완료. 준비를 승인하지 않고 재시도를 안내한다. `READY_CHECK_PENDING`: 같은 연결의 잔액 확인 진행 중. `READY_CHECK_CANCELLED`: 준비 확인이 취소됨. `READY_AUTH_REQUIRED`: 실제 로그인 ID를 확인할 수 없음.
- FE는 기존 `GET /api/v1/wallets/me`의 availableBalance로 준비 버튼을 막고 부족 금액을 표시한다. 조회 실패는 잔액 0으로 취급하지 않으며 다시 확인할 수 있다. 준비 취소는 잔액과 무관하게 가능하다.
- 준비 후 잔액이 변할 수 있으므로 실제 시작 직전 DB 잠금·판돈 예약 재검증을 유지한다. 시작 거절의 `GAME_START_STATE.phase=WAITING, code=INSUFFICIENT_BALANCE`는 참가자 잔액 부족을 뜻하며 전원 준비가 해제된다. 타인의 구체적 잔액은 방송하지 않는다.
