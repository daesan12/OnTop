# 알까기 비밀 카드·아이템8종 로컬 계약

2026-10-31 · S15P31B105-294 · 로컬 데모 계약. 제품 WebSocket·회원 인증·판돈·DB와 아직 연결하지 않았다.

## 구현 경계

- 실제 경기 객체는 빈 손패로 생성된다. 최대2장이고 카드 ID/종류는 소유자에게만 전달한다.
- 아이템8종과 손실 기반 지급 모두 로컬에서 사용할 수 있다. 미정 수치·수명은 `AlkkagiItemRules`, 추첨은 `AlkkagiCardRules`의 임시 설정이며 운영 합의가 아니다. 밸런스 확정은 [미정 목록](alkkagi-decisions.md)에 남긴다.
- `receiveCard`는 신뢰된 서버 지급 경계다. 제품 클라이언트에 원하는 종류 지급 요청을 노출하지 않는다.
- 로컬 테스트 클래스패스의 `TEST_CARDS`는 홍팀이 시작 전에 `cards` 배열(1~2종)을 골라 양쪽에 지급하는 연습 도구다. 생략 시 SWAP/EXTRA_SHOT이다. 실제 손실 기반 지급·중복 허용·확률 정책을 대신하지 않는다.
- 물리값30/60/1·종류별 프로필·120Hz 물리·20Hz 공개 스냅샷·100ms 화면 버퍼는 유지한다.

## 정상 플레이의 카드 지급

초기0장. 실제 물리 안정화 후 누적 손실3/6/9/12/15 이정표를 서버에서 확인한다. 현재 남은 알이 상대보다 적을 때만1장, 최대2장. 이정표는 손패가 가득 찼거나 열세가 아니어도 처리 완료하므로 나중에 소급하지 않는다. 재접속·동일 발사 재전송은 재추첨하지 않는다. 종료가 확정되는 발사에는 더 사용할 수 없는 카드를 지급하지 않는다.

미정 세부 정책의 **로컬 임시값**: 같은 발사의 탈락은 안정화 후 일괄 남은 수로 열세를 비교한다. 8종 동일 가중치·중복 허용, 경기 벽3회를 소진한 WALL은 추첨에서 제외한다. `AlkkagiCardRules`에서8종 가중치(0~1000, 적어도1종 양수)·중복 허용·소진 벽 제외를 한곳에서 바꿀 수 있다. 후보가 없으면 해당 이정표를 건너뛰고 소급하지 않는다. SecureRandom은 서버 안에서만 사용하고 RNG/시드는 DTO에 넣지 않는다. 이 임시값을 팀 합의나 원작 확률로 취급하지 않는다.

소유자 PRIVATE_STATE의 awards에는 자신의 `{losses,result}` 이정표 내역(AWARDED/NOT_BEHIND/HAND_FULL/NO_AVAILABLE_CARD)만 들어간다. 공개 STATE·관전자 통신에는 손패나 지급 내역을 넣지 않는다. 연습 카드 선택 지급은 위 실제 이정표 계산과 별도의 로컬 도구다.

## 사용 규칙

공통: 본인 차례 AIMING 단계의 첫 발사 전에만, 턴당 최대1장. gameId/expectedVersion/actionId/소유권/대상을 서버가 검증한 후 효과와 소모를 함께 확정한다. 잘못된 요청·확정 전 취소는 소모하지 않는다. 같은 actionId/같은 입력은 최초 승인 version을 반환하고, 다른 입력은 ACTION_ID_CONFLICT다. 발사와 아이템은 같은 중복 요청 공간을 사용한다.

SWAP은 양팀의 생존 알 두 개를 지정한다. 교환 후 각각의 실제 반지름으로 다른 생존 알·회전 벽과 겹치는지 검사한다. 동일 알·탈락한 알·겹침은 거절한다.

EXTRA_SHOT은 첫 발사 정지 후 같은 사용자의 두 번째 발사를 허용한다. **원래30초 마감은 유지**한다. 첫 발사 중 마감이 지나면 물리 종료 후 다음 차례로 넘기고, 승패/전체 시간 종료가 우선한다. 첫 발사가 있으면 추가 발사를 쓰지 않아도 AFK가 아니다. 카드만 쓰고 첫 발사를 하지 않으면 기존 미발사로 처리한다.

## 나머지6종과 임시 수치

| 종류 | 로컬 동작 | 임시 설정/만료 |
| --- | --- | --- |
| WALL | 빈 판의 위치·회전 선택, 서버 직사각형 정적 충돌체 설치. 알·판 가장자리 겹침 거절 | 길이1.6/두께.18/가장자리 여백.12, 알과.02 여백. 전역1개·인당 경기3회. 설치자 턴과 상대 다음 턴(스킵 포함) 종료까지 유지 |
| RELOCATE | 양팀 생존 알1개와 목적지 선택. 현재 반경·벽·다른 알·중심 경계 검사 | 현재 위치에서 최대2칸 |
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

EXTRA_SHOT/WALL의 targetPieceIds는 빈 배열, SWAP은2개, 나머지는1개다. WALL/RELOCATE만 `placement: {"x": 0, "y": 0, "angle": 0}`를 추가한다. XY는 판 평면, angle은 라디안(-π~π)이며 RELOCATE는 회전 없이 이동만 한다. 서버는 유한수치와 실제 형상·거리·소유권을 검사한다. 클라이언트가 카드 종류·효과 수치·교환 좌표를 지정하지 않는다. 미지 필드·2개 초과 대상·문자열 아닌 대상·잘못된 version은 거절한다. 실제 입력 파서는 `AlkkagiInputs`로 로컬 소켓과 공통 엔진이 함께 사용한다.

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

물리 진행 중 version도6스텝마다 갱신한다. 같은 version을 재전송하지 않는 기존 공통 상태 전송 경로에서도20Hz 물리 변화가 전달되도록 하기 위함이다. actionId의 최초 승인 version은 별도로 보존되어 이후 물리 version이 올라도 같은 요청의 최초 결과를 반환한다. FE `AlkkagiInbox`는 승인된 최소 version보다 낮은 프레임, 역순 seq, 공개와 짝이 다른 개인 손패를 무시한다.

## 로컬 관전·기권·복구

STATE.social은 채팅·커서·훈수만 포함한다. CHAT은 gameId/actionId/text(공백 제외1~200 code point), CURSOR는 gameId/x/y, ADVICE는 gameId/actionId/expectedVersion/pieceId/dx/dy/power를 받는다. sender/역할은 연결에서 가져오고 입력으로 바꿀 수 없다. 채팅은 React 텍스트로 표시해 HTML로 실행하지 않는다.

임시 제한: 채팅600ms, 커서80ms/2초 유효, 훈수600ms/4초 유효·관전자당 최신1개·전체 최신3개. 채팅은 최근50개를 보관하되 공개 프레임에는 보수적인 UTF-8/JSON 예산8KB 안의 최신 부분만 포함한다. 훈수는 관전자만, 현재 AIMING의 현재 턴 생존 알만 허용하고 방향/힘/버전을 검증한다. 실제 발사·물리·턴·승패를 변경하지 않는다. 훈수는 턴 변경·발사 시작·새 판·연결 종료에서 정리한다. 커서는2초 만료·새 판·연결 종료에서 정리하며 턴 전환만으로 지우지 않는다. 새 판은 채팅도 비운다. 이 로컬 통신은 제품의 기존 관전 거리·인증·채팅 권한을 대체하지 않는다.

FORFEIT(gameId/actionId)은 자신의 명시적 기권이다. 같은 actionId는 최초 결과 재확인, 다른 동작에 사용한 actionId는 충돌 거절. 즉시 물리를 멈추고 상대 승리로 확정하며, 이미 끝난 결과를 덮지 않는다. 로컬에서는 같은 역할의 마지막 연결이 사라진 뒤30초 유예를 주고, 그 안에 복귀하면 같은 판/기한/손패/확정 효과를 유지한다. 유예 만료는 DISCONNECT_TIMEOUT. 로컬 역할 URL은 실제 회원/다중 로그인 세션 검증이 아니다.

## 기존 게임 인터페이스와 연결할 경계

`AlkkagiEngine`은 기존 GameEngine/Router의 입력·상태·기권·복구를 구현하고 `startCommitted(command,result)`에서 ALKKAGI·2명·전원 예약 커밋 계약을 확인한다. 실제 예약/차감 요청이나 DB 저장을 만들지 않는다. 공개 gameId는 서버의 외부 경기 ID, players는 참가자 순서의 회원 ID 문자열이며 내부 actor0/1과 매핑한다. publicState는 gameCode/status/tableId/turnUserId/winnerUserId와 공개 판, privateState는 해당 회원 손패만 담는다. 복구 state는 기존 원카드와 같은 publicState/privateState 객체다. 알까기 시간 필드는 epoch ms다.

공통 요청은 기존 GAME_ACTION_SEND payload 안의 gameId/actionId/expectedVersion/input을 사용한다. input은 위 로컬 SHOT/ITEM_USE에서 type과 행동 필드만 남긴 형태다. 기권은 기존 GAME_FORFEIT, 상태는 기존 GAME_STATE_CHECK/관전 경로를 재사용할 수 있다. 이 어댑터는 일반 앱에 자동 등록하지 않았고, 검증에서는 예약 완료 계약 대역을 사용했다. 새 인증을 만들거나 팀원 DB 예약·정산 코드를 수정하지 않았다.

**실제 공원/DB 활성화는 완료가 아니다.** 현재 CommittedGameStartService의 지원 목록·게임 선택 카탈로그와 DB 종료 검증 VerifiedGameFinish.REASONS에 ALKKAGI가 없다. DB의 게임 종류 등록, 시작 호출 연결, 종료 사유/무승부/물리 실패 무효·환급 계약을 담당자와 함께 반영해야 한다. 현재 어댑터의 GameFinished를 기존 DB 소비자에 바로 연결하면 거절된다. SIMULATION_INVALID/LIMIT는 로컬 검증 종료이며 금전 결과로 사용하면 안 된다. 변경이 필요한 DB/공통 시작 서비스는 이번 작업에서 건드리지 않았고, Flyway/새 스키마도 만들지 않았다.

## 화면·검증

홍팀 로컬 화면에서 새 판 → 연습 카드2종 선택 → 연습 카드 받기(로컬) → 테스트 시작. 카드 선택 → 대상 알/빈 판 위치 선택 → 미리보기 → 아이템 확정. 벽은 각도 슬라이더로 회전한다. 취소/Esc/우클릭은 미확정 선택만 지운다. 일반 발사는 **처음 누른 채 바로 드래그하고 놓는 한 동작**이며 클릭/미세 흔들림은 발사하지 않는다. 추가 발사는 첫 정지 후 같은 남은 시간 안에 한 번 더 발사한다. 턴/판/승인 버전이 바뀌면 미확정 UI를 취소한다.

검증: 기존 아이템/물리 검사에 Completion(실제 손실 지급/자연 종료/안전 종료), Engine(예약 계약·격리·동시 기권·다음 판/복구 경쟁), Social(권한/중복/한도), LocalReconnect(가상 시계+소켓 대역의30초 유예), 실제 소켓·Chrome 일반 한 판/8종/벽고스트/관전/기권/복구 검사를 연결했다. 로컬 검증·DB 계약 대역을 실서버·실DB·운영 완료로 표시하지 않는다. 필요한 효과음·이미지는 [전달 목록](alkkagi-assets.md)을 따른다.

공용 화면 `frontend/src/game/alkkagi/AlkkagiBoard.tsx`는 승인 snapshot/replay/actor와 명령 callback으로 동작한다. 로컬 역할 URL·소켓·물리값 조절/연습 지급은 `alkkagi-preview/main.tsx`에 분리했다. 실제 공원 화면에서는 인증된 사용자/기존 GAME_ACTION_SEND와 상태 수신을 공급해야 하며 로컬 테스트 연결을 그대로 운영 인증으로 사용하지 않는다.

## 2026-10-31 사용자 검수 반영: 연출·아이템 범위·중심 경계
- SWAP/RELOCATE/GROW/SHRINK는 내 알·상대 알 모두 대상이다. POWER_UP/DEFEND는 내 알만, 발사도 여전히 내 알만이다. 턴/손패/생존/중복·소모 검증은 유지한다.
- 변형·재배치·교환·축소 원복의 판 경계는 생존과 같은 중심 좌표 기준이다. 반경이 밖으로 걸쳐도 중심이 판 안이면 허용한다. 다른 생존 알 또는 회전 벽과 실제 반경이 겹치는 배치/확대는 거절한다. 벽 자체는 판 전체 안/여백·알 겹침 검증을 유지한다.
- 공개 pieces[].exit는 최초 장외 순간의 {x,y,vx,vy,at} 또는 null이다. 안정화 후 본체 속도가0이 돼도 변경하지 않는다. 화면은 새 alive→false만 해당 속도로 수평 진행+중력 낙하·축소 소멸하며, 복구 시 이미 탈락한 알은 과거 연출을 재생하지 않는다. 시각 효과는 서버의 탈락/충돌/승패를 변경하지 않는다.
- 공격 강화는 주황 궤도/화살, 방어는 파란 구형 막, 확대는 보라·축소는 청록 화살로 지속 표시한다. 실제 승인 modifier/boostedPieceId에만 연결하며 소멸/만료 시 사라진다. 외부 이미지/모델 없이 Geometry로 렌더한다.
- AIMING의 서버 기준 턴 마감10초부터 판 중앙에 남은 초를 표시한다. 경고는 입력을 막지 않으며 새 판/턴 종료에 제거한다.
