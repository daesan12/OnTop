# 알까기 비밀 카드·위치 교환·추가 발사

2026-10-31 · S15P31B105-294 · 로컬 데모 계약. 제품 WebSocket·회원 인증·판돈·DB와 아직 연결하지 않았다.

## 구현 경계

- 실제 경기 객체는 빈 손패로 생성된다. 최대2장이고 카드 ID/종류는 소유자에게만 전달한다.
- 아이템8종은 유지한다. 이번에 사용 가능한 것은 SWAP/EXTRA_SHOT이며, 다른6종과 랜덤 지급 규칙은 [미정 목록](alkkagi-decisions.md)에 남긴다.
- `receiveCard`는 신뢰된 서버 지급 경계다. 제품 클라이언트에 원하는 종류 지급 요청을 노출하지 않는다.
- 로컬 테스트 클래스패스의 `TEST_CARDS`는 홍팀이 시작 전에 한 번 호출해 양쪽에 SWAP/EXTRA_SHOT 한 장씩 지급하는 연습 도구다. 실제 손실 기반 지급·확률 정책을 대신하지 않는다.
- 물리값30/60/1·종류별 프로필·120Hz 물리·20Hz 공개 스냅샷·100ms 화면 버퍼는 유지한다.

## 사용 규칙

공통: 본인 차례 AIMING 단계의 첫 발사 전에만, 턴당 최대1장. gameId/expectedVersion/actionId/소유권/대상을 서버가 검증한 후 효과와 소모를 함께 확정한다. 잘못된 요청·확정 전 취소는 소모하지 않는다. 같은 actionId/같은 입력은 최초 승인 version을 반환하고, 다른 입력은 ACTION_ID_CONFLICT다. 발사와 아이템은 같은 중복 요청 공간을 사용한다.

SWAP은 생존한 내 알 두 개를 지정한다. 교환 후 각각의 실제 반지름으로 다른 생존 알과 겹치는지 검사한다. 상대 알·동일 알·겹침은 거절한다. 현재 판에는 고정/아이템 벽이 없으며, 벽 구현 시 벽 겹침 검사도 함께 연결해야 한다.

EXTRA_SHOT은 첫 발사 정지 후 같은 사용자의 두 번째 발사를 허용한다. **원래30초 마감은 유지**한다. 첫 발사 중 마감이 지나면 물리 종료 후 다음 차례로 넘기고, 승패/전체 시간 종료가 우선한다. 첫 발사가 있으면 추가 발사를 쓰지 않아도 AFK가 아니다. 카드만 쓰고 첫 발사를 하지 않으면 기존 미발사로 처리한다.

## 로컬 요청·응답

`ws://127.0.0.1:19183/dev/alkkagi-ws?role=red|green|viewer`

role 쿼리는 로컬 테스트 역할이며 인증이 아니다. 이 데모 핸들러는 운영 JAR에 포함되지 않는다.

```json
{
  "type": "ITEM_USE",
  "gameId": "현재 STATE의 gameId",
  "actionId": "고유 요청 ID",
  "expectedVersion": 5,
  "cardId": "내 PRIVATE_STATE의 카드 ID",
  "targetPieceIds": ["p11", "p12"]
}
```

EXTRA_SHOT의 targetPieceIds는 빈 배열이다. 클라이언트는 카드 종류·효과 수치·교환 좌표를 보내지 않는다. 미지 필드·2개 초과 대상·문자열 아닌 대상·잘못된 version은 거절한다.

성공은 ITEM_ACCEPTED(actionId/version), 실패는 ERROR(code)다. 주요 코드는 PLAYER_REQUIRED, STALE_GAME, STALE_VERSION, NOT_AIMING, NOT_YOUR_TURN, CARD_NOT_OWNED, INVALID_TARGETS, NOT_YOUR_PIECE, ITEM_OVERLAP, ITEM_ALREADY_USED_OR_SHOT, ACTION_ID_CONFLICT다. 다른 미구현 카드의 사용은 ITEM_POLICY_PENDING으로 거절한다.

매 공개 STATE와 같은 seq/gameId/version의 PRIVATE_STATE를 본인에게만 보낸다.

```json
{
  "type": "PRIVATE_STATE",
  "seq": 42,
  "state": {
    "gameId": "현재 경기",
    "version": 5,
    "cards": [{ "id": "소유자 전용 ID", "type": "SWAP" }]
  }
}
```

상대·관전자에게 미사용 종류/ID는 보내지 않는다. 공개 STATE에는 itemUsedThisTurn, extraShotsRemaining(추가분0/1), lastItemEffect(version/turnNumber/actor/type/targets)만 추가한다. lastItemEffect는 최신 확정 효과를 설명하는 상태이며 일회성 연출 이벤트가 아니다. 재접속 시 이를 새 연출로 재생하면 안 된다.

공개/개인 JSON을 물리 소유 스레드에서 같은 발행 묶음으로 만들고 AtomicReference 하나로 송신 스레드에 넘긴다. 최신 상태 교체 중에도 서로 다른 버전의 손패가 짝지어지지 않는다. 소켓 쓰기는 기존대로 별도 sender에서 수행한다. 연결 복구는 현재 손패/상태를 재조회하며 타이머를 초기화하지 않는다. 서버 프로세스 재시작은 데모 판을 초기화한다.

## 화면·검증

홍팀 로컬 화면에서 새 판 → 연습 카드 받기(로컬) → 테스트 시작. 위치 교환 카드 선택 → 내 알 두 개 클릭 → 아이템 확정. 취소/Esc/우클릭은 미확정 선택만 지운다. 추가 발사는 카드 선택 → 확정 → 일반 발사 → 정지 후 같은 남은 시간 안에 한 번 더 발사한다. 턴/판/승인 버전이 바뀌면 미확정 UI를 취소한다.

검증: AlkkagiItemTests(손패 비공개·한도·교환/겹침·권한·중복·추가 발사·기한·AFK), AlkkagiSocketTests(실제 홍/청/관전자 전송 분리·위조 카드 거절·재접속), Chrome items.spec.ts(선택·취소·확정·교환·추가 발사). 기존 물리·조준·재생 회귀도 함께 실행한다. 로컬 검증을 제품 통합/운영 완료로 표시하지 않는다.
