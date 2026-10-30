# 알까기 비밀 카드·아이템8종 로컬 계약

2026-10-31 · S15P31B105-294 · 로컬 데모 계약. 제품 WebSocket·회원 인증·판돈·DB와 아직 연결하지 않았다.

## 구현 경계

- 실제 경기 객체는 빈 손패로 생성된다. 최대2장이고 카드 ID/종류는 소유자에게만 전달한다.
- 아이템8종 모두 로컬에서 사용할 수 있다. 미정 수치·수명은 `AlkkagiItemRules`의 조절 가능한 임시값이며 운영 합의가 아니다. 랜덤 지급 규칙·밸런스 확정은 [미정 목록](alkkagi-decisions.md)에 남긴다.
- `receiveCard`는 신뢰된 서버 지급 경계다. 제품 클라이언트에 원하는 종류 지급 요청을 노출하지 않는다.
- 로컬 테스트 클래스패스의 `TEST_CARDS`는 홍팀이 시작 전에 `cards` 배열(1~2종)을 골라 양쪽에 지급하는 연습 도구다. 생략 시 SWAP/EXTRA_SHOT이다. 실제 손실 기반 지급·중복 허용·확률 정책을 대신하지 않는다.
- 물리값30/60/1·종류별 프로필·120Hz 물리·20Hz 공개 스냅샷·100ms 화면 버퍼는 유지한다.

## 사용 규칙

공통: 본인 차례 AIMING 단계의 첫 발사 전에만, 턴당 최대1장. gameId/expectedVersion/actionId/소유권/대상을 서버가 검증한 후 효과와 소모를 함께 확정한다. 잘못된 요청·확정 전 취소는 소모하지 않는다. 같은 actionId/같은 입력은 최초 승인 version을 반환하고, 다른 입력은 ACTION_ID_CONFLICT다. 발사와 아이템은 같은 중복 요청 공간을 사용한다.

SWAP은 생존한 내 알 두 개를 지정한다. 교환 후 각각의 실제 반지름으로 다른 생존 알·회전 벽과 겹치는지 검사한다. 상대 알·동일 알·겹침은 거절한다.

EXTRA_SHOT은 첫 발사 정지 후 같은 사용자의 두 번째 발사를 허용한다. **원래30초 마감은 유지**한다. 첫 발사 중 마감이 지나면 물리 종료 후 다음 차례로 넘기고, 승패/전체 시간 종료가 우선한다. 첫 발사가 있으면 추가 발사를 쓰지 않아도 AFK가 아니다. 카드만 쓰고 첫 발사를 하지 않으면 기존 미발사로 처리한다.

## 나머지6종과 임시 수치

| 종류 | 로컬 동작 | 임시 설정/만료 |
| --- | --- | --- |
| WALL | 빈 판의 위치·회전 선택, 서버 직사각형 정적 충돌체 설치. 알·판 가장자리 겹침 거절 | 길이1.6/두께.18/가장자리 여백.12, 알과.02 여백. 전역1개·인당 경기3회. 설치자 턴과 상대 다음 턴(스킵 포함) 종료까지 유지 |
| RELOCATE | 내 알1개와 목적지 선택. 현재 반경·벽·다른 알·판 안쪽 검사 | 현재 위치에서 최대2칸 |
| POWER_UP | 지정한 내 알만 다음 발사 가능. 다른 알 발사 요청 거절 | 출발속도1.5배. 승인 발사1회 후 소모, 미발사는 이번 턴 종료에 해제 |
| GROW | 반경과 실제 dyn4j fixture 변경 | 반경1.25배, 질량1.25²배 |
| SHRINK | 반경과 실제 dyn4j fixture 변경 | 반경.8배, 질량.8²배 |
| DEFEND | 반경 그대로, 실제 충돌 질량 증가 | 질량2배 |

확대·축소·방어는 기본적으로 다음 상대 턴 종료까지 유지한다. `effectOpponentTurns`를1~3으로 조절 가능하며, 알별 기존 크기/방어 효과 중첩은 거절한다. 같은 크기로 복귀하는 방어·작아지는 확대 원복은 즉시 수행한다. 축소 알을 다시 키울 때만 겹침/벽/판 내부 검사를 하며, 공간이 없으면 modifier/restorePending 상태를 유지하고 매 턴 종료에 재검사한다. 강제 이동·겹침 생성·질량만 먼저 원복은 하지 않는다. 탈락한 알은 화면에서 숨기며, 경기가 계속되면 만료 후 턴 전환 시 효과를 정리한다. 종료 스냅샷에는 최종 효과 상태가 남을 수 있다.

크기/방어로 질량이 달라도 같은 조준의 출발속도는 유지하도록 현재 질량으로 충격량을 계산한다. 충돌 시 운동량·버티는 정도가 달라진다. 힘 강화 배율은 출발속도에 적용하며 별도 질량 강화가 아니다. 평상시 물리30/60/1은 바꾸지 않는다.

임시 수치 근거: 확대1.25/축소.8은 전달된 초기 검토값, 나머지는 원작 측정이나 팀 합의가 없는 로컬 검수 시작값이다. 벽 길이.5~3/두께.1~.5/여백.02~.4, 재배치.5~3, 힘1.05~2, 확대1.05~1.5/축소.5~.95, 방어1.1~4, 지속 상대1~3턴 범위만 허용한다. 홍팀의 ‘아이템 수치 조절’은 `TUNE_ITEMS(gameId/expectedVersion/rules)`로 검증된 **새 판**만 생성한다. 현재 시뮬레이션 계수를 중간에 바꾸거나 파일/환경변수를 저장하지 않는다. 잘못된 값은 기존 판 보존, 청팀/관전자 변경 거절. 일반 새 판/물리 조절은 현재 아이템 설정을 유지하고 서버 재시작은 기본 임시값으로 돌아간다.

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

EXTRA_SHOT/WALL의 targetPieceIds는 빈 배열, SWAP은2개, 나머지는1개다. WALL/RELOCATE만 `placement: {"x": 0, "y": 0, "angle": 0}`를 추가한다. XY는 판 평면, angle은 라디안(-π~π)이며 RELOCATE는 회전 없이 이동만 한다. 서버는 유한수치와 실제 형상·거리·소유권을 검사한다. 클라이언트가 카드 종류·효과 수치·교환 좌표를 지정하지 않는다. 미지 필드·2개 초과 대상·문자열 아닌 대상·잘못된 version은 거절한다.

성공은 ITEM_ACCEPTED(actionId/version), 실패는 ERROR(code)다. 주요 코드는 PLAYER_REQUIRED, STALE_GAME, STALE_VERSION, NOT_AIMING, NOT_YOUR_TURN, CARD_NOT_OWNED, INVALID_TARGETS, NOT_YOUR_PIECE, ITEM_OVERLAP, ITEM_ALREADY_USED_OR_SHOT, ACTION_ID_CONFLICT다. 추가 코드는 INVALID_PLACEMENT, ITEM_OUTSIDE_BOARD, ITEM_OVERLAP_OR_OUTSIDE, RELOCATE_TOO_FAR, WALL_ALREADY_EXISTS, WALL_LIMIT, MODIFIER_ACTIVE, BOOST_TARGET_REQUIRED, INVALID_ITEM_RULES다.

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

상대·관전자에게 미사용 종류/ID는 보내지 않는다. 공개 STATE에는 itemUsedThisTurn, extraShotsRemaining(추가분0/1), lastItemEffect(version/turnNumber/actor/type/targets), wall(소유자/위치/길이/두께/각도/만료 턴) 또는 null, wallsUsed, boostedPieceId, itemRules가 있다. 알별 radius/mass/launchSpeed/modifier/restorePending도 서버 현재값이다. lastItemEffect는 최신 확정 효과를 설명하는 상태이며 일회성 연출 이벤트가 아니다. 재접속 시 이를 새 연출로 재생하면 안 된다.

공개/개인 JSON을 물리 소유 스레드에서 같은 발행 묶음으로 만들고 AtomicReference 하나로 송신 스레드에 넘긴다. 최신 상태 교체 중에도 서로 다른 버전의 손패가 짝지어지지 않는다. 소켓 쓰기는 기존대로 별도 sender에서 수행한다. 연결 복구는 현재 손패/상태를 재조회하며 타이머를 초기화하지 않는다. 서버 프로세스 재시작은 데모 판을 초기화한다.

## 화면·검증

홍팀 로컬 화면에서 새 판 → 연습 카드2종 선택 → 연습 카드 받기(로컬) → 테스트 시작. 카드 선택 → 대상 알/빈 판 위치 선택 → 미리보기 → 아이템 확정. 벽은 각도 슬라이더로 회전한다. 취소/Esc/우클릭은 미확정 선택만 지운다. 일반 발사는 **처음 누른 채 바로 드래그하고 놓는 한 동작**이며 클릭/미세 흔들림은 발사하지 않는다. 추가 발사는 첫 정지 후 같은 남은 시간 안에 한 번 더 발사한다. 턴/판/승인 버전이 바뀌면 미확정 UI를 취소한다.

검증: AlkkagiItemTests(손패/교환/추가발사), AlkkagiExtendedItemTests(나머지6종의 실제 충돌·소모·기한·질량/반경 원복·겹침 보류·가장자리 만료), AlkkagiSocketTests(실제 역할 분리/재접속), Chrome items.spec.ts(8종 선택/미리보기/확정·첫 드래그·설정). 기존 물리·조준·재생 회귀도 함께 실행한다. 로컬 검증을 제품 통합/운영 완료로 표시하지 않는다.
