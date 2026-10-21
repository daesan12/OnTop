# 거짓말 다리 · LIAR_BRIDGE

2026-10-21 수신 ZIP의 현행 rules/04_ciao_ciao.md와 상세 예외 명세를 적용한다. 사용자 최종 결정으로 굴림·선언·각 판단은 모두30초다. 굴림/선언 만료는 자동 굴림·자동 선언 없이 현재 차례를 넘기고, 판단 만료는 믿은 것으로 다음 판단자에게 넘긴다. 기존5/12/7초 규칙을 대체한다. 판정 후1.5초 입력 대기는 그대로다. 오목의30초 시간패와 구분한다.

## 입력

기존 GAME_ACTION_SEND의 gameId/actionId/expectedVersion을 유지한다. 서버가 경기와 참가자를 확정하고 버전으로 단계·중복을 검사한다.

| input | 조건 |
| --- | --- |
| {kind:"roll"} | AWAITING_ROLL의 turnUserId만. 서버가1·2·3·4·X·X 균등6면을 추첨 |
| {kind:"declare",value:1~4정수} | DECLARING의 turnUserId만. X는 어떤 숫자도 거짓말 |
| {kind:"trust"} | RESPONDING의 responderUserId만 |
| {kind:"doubt"} | RESPONDING의 responderUserId만 |

추가 필드·눈/승자 주입·잘못된 단계/차례·지난 버전은 거절한다. 새 행동은 새 actionId, 동일 행동 재확인은 원래ID·버전·input 유지다. 원본 TypeScript BridgeAction의 matchId/expectedRevision/turnId/phaseVersion/requestId는 직접 전송하지 않는다. 공통 gameId/expectedVersion/actionId와 최상위 requestId를 사용한다. 종료·RESOLVING에는 새 입력을 받지 않는다.

## 공개·개인 상태

GAME_STATE.publicState는 아래 필드만 조립한다. 사용자 ID는 문자열, 시각은 UTC 문자열/null이다. 말ID·슬롯번호는 정수다.

| 필드 | 의미 |
| --- | --- |
| gameCode/status | LIAR_BRIDGE,PLAYING/FINISHED |
| stage | AWAITING_ROLL/DECLARING/RESPONDING/RESOLVING/FINISHED |
| turnId/turnUserId/responderUserId | 차례 번호/선언자/현재 판단자. 종료시사용자null |
| turnDeadline/phaseTimeLimitMs/resolutionVisualMs | 현재 단계마감/30000/1500. RESOLVING 마감은연출종료,종료시null |
| declaration/responseOrder/acceptedBy | 선언 숫자/null,판단순서 ID배열,믿은 사용자ID배열 |
| players | [{userId,score,goals,forfeited,pendingForfeit,pawns}] |
| pawns | [{id,status,position,goalSlot}]. 플레이어당7개. ACTIVE/RESERVE/SCORED/FALLEN/REMOVED_SCORED/FORFEITED |
| goalSlots | 8개 [{slot,status,userId,pawnId,removedReason,firstAssignedTurnId}]. UNUSED/OCCUPIED/VACATED |
| nextGoalSlot | 다음발급번호1~9. VACATED번호재사용없음 |
| resolution | 최근원자판정 또는null. 아래참고 |
| operations | 최근독립변경연산배열. 각항목type/userId/pawnId/fromPosition/toPosition/slotNumber/reason |
| lastEvent | START/ROLL/DECLARE/TRUST/ALL_TRUSTED/DOUBT_SUCCESS/DOUBT_FAILED/TURN_TIMEOUT/JUDGE_TIMEOUT/PLAYER_LEFT |
| winnerUserIds/endReason/endedAt | 승자ID배열/종료사유/UTC종료시각 |

position은ACTIVE0~8,골인/제거골인9이며낙하말은낙하전위치를유지한다. reserve는0,goalSlot은발급이력으로제거후에도유지한다. removedReason은FAILED_DOUBT/FORFEIT/null이다. 연산은FALL_PAWN/MOVE_PAWN/SCORE_PAWN/VACATE_GOAL_SLOT/SPAWN_PAWN/FORFEIT_PLAYER이며해당없는필드는null이다.

resolution은 {turnId,declarerUserId,declaredNumber,challenged,startedAt,operations}다. **challenged=false이면 actualFace/challengerUserId/wasBluff 키 자체가 없다.** challenged=true일 때만 actualFace(1~4 또는"X"),challengerUserId,wasBluff를추가한다. 이전판정은turnId로구분해중복연출하지않는다. 실제위치·점수는전체스냅샷우선이며중간프레임전달을보장하지않는다.

굴린 본인에게만 DECLARING/RESPONDING 동안 privateState={userId,turnId,die:1~4 또는"X"}다. 상대·관전자·굴림전·판정후·기권예정자는 {}다. 모두 믿은 눈은 판정 후 폐기하고 공개 기록에 남기지 않는다. GAME_CONNECTION_STATE 복구 state={publicState,privateState}로 같은 눈과 원래 마감을 복구하며 재추첨하지 않는다. 기존20m 관전·계정 중복 연결 차단·30초 재접속 유예를 유지한다.

## 판정과 종료

- 2~4명,각7개말,현재말1개출발점0·예비6개. 위치9이상이면골인,초과이동없음·같은칸공존허용.
- 선언자다음좌석부터시계방향순차판단. 골인말만있는사람은판단가능·본인주사위차례없음. 말전부소진은기권과다름. 유효판단자0명이면즉시비공개전진.
- 모두믿음: 선언자전진·실제눈비공개. 거짓다우트성공: 선언자추락→도전자현재말전진. 진실다우트실패: 도전자현재말추락→선언자전진. 골인말만있는도전자는성공시이동없고실패시최저골인번호1개제거.
- 원자처리: 페널티→이동→골인번호발급→대기기권반영→종료검사→미종료시새말투입. 기권자의현재/예비말사용불가·골인말모두제거,슬롯VACATED·번호재사용없음.
- 기권은안전경계에서즉시,진행중굴림후선언/심사중이면pendingForfeit로표시하고판정/선언만료경계뒤반영. 현재판단자기권은즉시믿기,나머지기권예정자는판단에서제외한다. 기권예정자의입력/개인눈복구는차단한다.
- 종료우선순위: THREE_GOALS→LAST_PLAYER_STANDING→ABORTED_NO_PLAYERS→GOAL_SLOTS_EXHAUSTED→NO_RUNNABLE_PAWNS. 마지막둘은미기권자점수최댓값동점공동승리,0점동점포함. 골인3개는현재유효말기준이며8번발급과동시이면3개승리우선.
- 타이머는굴림/선언/각판단에새30초,재접속/조회/거절로연장없음. 입력검사와실제200ms스케줄러가같은만료처리. 마감정각은만료우선,연출1.5초도서버기준.

## 활성화·검증 경계

local에서 `ontop.games.bridge.enabled=true`로선택활성화한다. 실제인증·참가/차감확정후서버내부 `BridgeEngine.create(gameId,tableId,players)`만사용한다. 기본off,임의생성/인증우회외부API없음. 공유라우터가경기ID/참가자/테이블의교차중복을막는다.

BridgeGameFinished는판정완료알림이며DB정산/지급확정이아니다. 메모리상태로재시작/다중서버복구없음. 기존프론트타입의Colyseus·접속표시·별도phaseVersion필드를그대로구현한것이아니며현재RawWS계약을따른다. 접속유예는기존공통연결부가관리한다.

BridgeMatchTests는결정적경계와무작위1,000경기말/슬롯/점수불변식을검사한다. BridgeEngineTests는JSON비밀격리·동시판단·종료1회·복구를검사한다. BridgeFlowTests는실제엔진/SecureRandom/Spring/RawWS/스케줄러의비밀눈·모두믿음/다우트·관전·heartbeat복귀·30초판단넘김·서버기권종료를검증한다. 인증/참가확정은대역·시간은제어시계이며실제프론트/DB/운영검증과구분한다.
