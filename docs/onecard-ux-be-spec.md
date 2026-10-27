# 원카드 UX BE 작업 명세 — 계약 제안

작성: 2026-10-27 KST. **아래 장난 메시지는 신규 제안이며 서버 구현·배포 확인 전이다.** 기존 원카드 게임 액션과 정산 계약은 유지한다.

## BE-01 전략 드로우와 비공개 상태

낼 수 있는 카드가 있어도 PLAYING·본인 턴·attackTotal=0에서 draw를 허용한다. 한 장 지급 후 차례를 넘긴다. 기존 `privateState.canDraw`와 `playableCardIds`는 독립 값이다. 공격·무늬 선택·시간 만료에는 기존 제한을 유지한다. 공개 snapshot에 플레이어별 cardCount만 제공하고 hand/playableCardIds를 섞지 않는다.

## BE-02 장난 승인과 한도

인증된 승인 관전자·같은 채널/경기·현재 관전 구독·거리 정책·경기 PLAYING·stage PLAYING·현재 활성 대상 턴을 모두 확인한다. 플레이어/다른 경기/관전 해제 요청을 거절한다.

게임 잠금 안에서 `(gameId, targetUserId, turnCount)`별 승인 1회를 원자적으로 소모한다. 서로 다른 관전자·중복 탭도 동일 한도다. K 추가 행동과 무늬 선택은 새로운 턴이 아니므로 한도를 재설정하지 않는다. effect active 또는 immuneUntil 이전에는 거절하고 효과·면역 만료 시간을 연장하지 않는다. effect 종료·복구와 턴 변경을 같은 순서로 직렬화한다.

## BE-03 WS 제안

기존 Envelope/requestId·인증 소켓을 사용한다. eventId는 UUID, 시간은 Unix milliseconds. 별도 GAME_ACTION_SEND·expectedVersion 소비를 하지 않으며 game version·턴 타이머·덱·정산을 바꾸지 않는다.

| 방향 | type | payload |
| --- | --- | --- |
| 관전자→서버 | ONECARD_HAND_FLIP_SEND | gameId, eventId, targetUserId, turnCount |
| 서버→해당 경기 참가자/승인 관전자 | ONECARD_HAND_FLIPPED | gameId, eventId, targetUserId, turnCount, count(1 또는 2), serverNow |
| 대상→서버 | ONECARD_HAND_RESTORE_SEND | gameId, eventId(새 UUID), effectId(원래 flip eventId) |
| 서버→해당 경기 참가자/승인 관전자 | ONECARD_HAND_RESTORED | gameId, eventId, effectId, targetUserId, turnCount, immuneUntil, serverNow |

발신 ACK는 같은 이벤트를 동일 requestId로 반환한다. 브로드캐스트와 ACK는 eventId로 중복 제거한다. 실제 cardId·무늬·숫자·privateState는 절대 전송하지 않는다. 서버는 count만 결정하고 대상 FE가 선택·제출 보호를 적용해 가릴 카드 0~2장을 선택한다. 0장이면 즉시 RESTORE한다. 효과는 시각적 장난이므로 클라이언트 복구를 막아 부하를 주지 않는다.

RESTORE는 effectId의 대상 본인만 가능하며 멱등 처리한다. 최초 복구 승인 시 `immuneUntil=serverNow+2500`, 중복은 최초 값을 반환한다. 복구 요청 손실·접속 종료 때문에 active가 영구히 남지 않게 턴 종료/연결 복구/최대 30초 안전 만료 때 정리한다. 서버가 복구를 직접 알릴 때도 RESTORED를 전송한다. 재접속 시 과거 FLIPPED를 재생하지 않는다. 면역은 다음 턴에도 유지한다.

제안 오류는 모두 `ONECARD_PRANK_` 접두사를 사용한다: NOT_CONFIGURED, ACCESS_DENIED, STALE_TURN, ALREADY_USED, EFFECT_ACTIVE, IMMUNE, GAME_NOT_PLAYING. 오류는 requestId로 요청에 귀속한다. 지원 거절 시 FE 장난 기능만 잠근다.

## BE-04 테스트·완료 조건

- 10명 관전자 동시 요청에도 대상의 동일 턴 승인 1회. effectId 중복 재전송에 추가 적용 없음.
- 선택/제출 동시 장난에도 게임 액션 승인·게임 version·기존 카드 효과 동일.
- 복구 1회·중복 복구·복구 ACK 손실·턴 변경·종료·이탈·재접속에서 active 정리 및 면역 2500ms 확인.
- 모든 공개 이벤트·로그·관전자 snapshot에 cardId/hand 미포함.
- 대상별 다음 턴 재사용 가능하되 남은 면역 중에는 거절.
- 기존 드로우·공격·K·무늬·선언·신고·정산 테스트 통과.

FE의 제안 어댑터는 기본 비활성이다. 최종 메시지/필드가 바뀌면 원카드 `prankEvents.ts` 어댑터에서 반영한다. 운영 다중 계정 검수 후 활성화한다.
