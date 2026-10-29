# 원카드 관전자 장난·뿅망치 방어 API

2026-10-28 · 담당 장대산 · S15P31B105-259. 최신 FE 요청 기준 서버 구현·로컬 검증이며 배포·실계정 3D 검수는 별도다.

## 활성화와 권한

기존 원카드 엔진과 인증·예약·정산 계약을 유지한다. `ontop.games.onecard.enabled=true`에 `ontop.games.onecard.pranks-enabled=true`를 함께 지정한다(pranks 기본 false). `ontop.games.onecard.defense-enabled` 기본 true다. FE의 VITE_ONECARD_PRANKS/VITE_ONECARD_PRANK_DEFENSE도 공동 검수 후 함께 켠다. 이 작업에서 실행 서버 설정은 바꾸지 않는다.

방어 활성 시 구형 ONECARD_HAND_FLIP_SEND는 ONECARD_DEFENSE_REQUIRED로 거절한다. 방어 비활성 호환 모드에서만 구형 즉시 뒤집기를 허용하며 새 REACH/HIT는 ONECARD_DEFENSE_NOT_CONFIGURED다. 장난 전체 미설정도 같은 NOT_CONFIGURED다.

REACH는 인증된 승인 관전자·같은 경기/채널·테이블 중심 20m·PLAYING 단계·현재 대상 턴·접속 중인 대상 참가자를 확인한다. HIT/RESTORE는 대상 참가자 본인만 가능하다. actor는 인증 소켓에서 결정하며 본문으로 받지 않는다. 공개 이벤트에 실제 cardId/무늬/숫자/hand/privateState를 넣지 않는다.

최신 FE 요청에 따라 `(gameId, actorUserId, targetUserId, turnCount)`당 1회다. 이전 제안의 관전자 전체 공유 한도를 대체한다. K 추가 행동·무늬 선택은 새 턴이 아니다. 방어 성공 시 해당 관전자→대상만 3초 차단하며 다른 관전자까지 막지 않는다. 차단이 끝나도 같은 턴의 사용 1회는 복원되지 않는다.

## 판정과 수명

서버가 1,400ms 방어 마감 시각을 고정한다. 마감 전 HIT 승인 또는 마감 FLIPPED 중 하나만 성립한다. TableHub→실제 OneCardEngine 잠금 순서 안에서 턴 입력·기권·만료와 직렬화한다. 게임 version·실제 손패·덱·턴 마감·정산은 변경하지 않는다.

한 경기 동시 대기 최대 4개, 사용자당 새 승인 최대 5회/초다. 같은 eventId 재확인은 제한을 추가 소비하지 않는다. 새 REACH는 영수증 2,000개에서 제한해 이미 승인한 시도의 HIT/RESTORE 공간을 남긴다(전체 최대 2,048개).

서버는 count 최대2만 보내며 FE가 선택·제출 보호 카드를 제외한다. 적격 카드0장이면 즉시 RESTORE한다. 최초 복구 승인 후 2,500ms 대상 면역, 중복 요청은 면역을 연장하지 않는다. 다음 턴에도 남은 면역은 유지한다.

턴/단계/경기 종료·기권·관전 해제·거리/채널 이탈·접속 종료 시 대기 취소. 활성 효과는 턴 전환·종료·대상 단절 또는 최대30초에 복구한다. 새 연결에 과거 연출을 자동 전송하지 않는다. 영수증·면역은 프로세스 메모리이며 유휴2분 후 제거한다. 재시작/다중 서버 공유는 제공하지 않는다.

## 메시지

기존 Raw WS Envelope 유지. UUID 식별자, userId 양수 문자열, turnCount 정수, 시간 Unix milliseconds. 요청에 아래 이외 필드는 거절한다.

| 요청 type | payload |
| --- | --- |
| ONECARD_PRANK_REACH_SEND | gameId, eventId, targetUserId, turnCount |
| ONECARD_PRANK_HIT_SEND | gameId, eventId(새 UUID), attemptId |
| ONECARD_HAND_RESTORE_SEND | gameId, eventId(새 UUID), effectId(최초 flip eventId) |
| ONECARD_HAND_FLIP_SEND | gameId, eventId, targetUserId, turnCount — 방어 비활성 호환 전용 |

| 응답/이벤트 type | payload |
| --- | --- |
| ONECARD_PRANK_REACH_STARTED | gameId, eventId, attemptId, actorUserId, targetUserId, turnCount, serverNow, resolveAt |
| ONECARD_PRANK_BLOCKED | gameId, eventId, attemptId, actorUserId, targetUserId, turnCount, serverNow, blockedUntil |
| ONECARD_PRANK_REACH_RESOLVED | gameId, eventId, attemptId, actorUserId, targetUserId, turnCount, serverNow, outcome(FLIPPED/BLOCKED/CANCELLED) |
| ONECARD_HAND_FLIPPED | gameId, eventId, targetUserId, turnCount, count(1/2), serverNow |
| ONECARD_HAND_RESTORED | gameId, eventId, effectId, targetUserId, turnCount, immuneUntil, serverNow |

REACH_STARTED/BLOCKED/RESOLVED는 해당 관전자와 대상에게만, FLIPPED/RESTORED는 현재 참가자와 승인 관전자에게 보낸다. ACK requestId는 원래 값, 방송 requestId는 null이다. FLIPPED eventId는 최초 REACH eventId, RESOLVED는 별도 사건 eventId와 기존 attemptId다.

```json
{
  "requestId": "10000000-0000-4000-8000-000000000001",
  "type": "ONECARD_PRANK_REACH_SEND",
  "payload": {
    "gameId": "game-example",
    "eventId": "20000000-0000-4000-8000-000000000001",
    "targetUserId": "101",
    "turnCount": 3
  }
}
```

동일 사용자/eventId·동일 내용은 최초 attemptId/마감/면역으로 재확인하며 추가 방송하지 않는다. 다른 내용 재사용은 EVENT_CONFLICT다. serverNow만 현재 시각으로 갱신해 시간 연장을 막는다. 과거 시작 형태 재확인 ACK도 만료 resolveAt을 유지하므로 FE가 이미 지난 연출을 재생하지 않는다.

일반 ERROR code 접두사 ONECARD_PRANK_: ACCESS_DENIED, GAME_NOT_PLAYING, STALE_TURN, BLOCKED, ALREADY_USED, EFFECT_ACTIVE, IMMUNE, TOO_MANY_ATTEMPTS, TOO_FREQUENT, TOO_LATE, EVENT_CONFLICT. 기능 미설정/구형 우회는 위 별도 코드다. 오류 requestId를 유지한다.

## 검증

OneCardPranksTests: 방어/마감 경합·관전자별 차단·재확인·턴 취소·면역. OneCardPrankProtocolTests: 엄격한 필드. OneCardPrankFlowTests: 실제 JWT/접속권/Raw WS·원카드 엔진의 관전→방어→다른 관전자 뒤집기→복구·정보 격리. 회원 조회/예약/정산은 대역, 시계는 제어한다. check-game-additions-frontend.mjs는 실제 프레임을 무수정 FE 이벤트 처리기로 검증한다. 배포·실계정 화면 검수 완료를 뜻하지 않는다.
