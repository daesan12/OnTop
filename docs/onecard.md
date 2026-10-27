# 원카드 · ONE_CARD

2026-10-27 추가 UX: [어깨 시점·부채꼴 손패·관전자 뒤집기 기획](onecard-ux-plan.md), [FE 작업 명세](../frontend/docs/ONECARD_UX_FE_SPEC.md), [BE 작업 명세(계약 제안)](onecard-ux-be-spec.md). 기존 규칙·게임 액션·정산은 아래 계약을 유지한다.

2026-10-21 수신 규칙 ZIP의 rules/02_onecard.md(F1 현행)를 우선하고 상세 원카드 v1.0을 보조로 대조했다. 2~4인,54장(조커2장 포함),7장배분,랜덤선공이다. 첫 바닥은4/5/6/8/9/10. 서버가 초기덱을 섞고 유효 바닥 선택 후 남은덱도 섞는다. 4인에게 숫자카드가 모두 배분되어 바닥후보가 없으면 공개 전 초기배분만 최대8회 재시도하고 반복실패는 경기점유 없이 거절한다.

**2026-10-22 사용자 확정: 기권자의 손패는 이번 경기에서 제외한다(REMOVE).** 뽑기 덱에 돌려 넣거나 섞지 않는다. 남은 참가자는 기존 뽑기 덱으로 계속하며 다음 경기는 전체 새 덱으로 시작한다. 정식 엔진·소켓 검사·개발 시연에 같은 정책을 적용한다.

## 입력

기존 GAME_ACTION_SEND payload의 gameId/actionId/expectedVersion과 아래 input을 사용한다. 버전은 최신 GAME_STATE 기준, 새행동은새ID/동일행동재확인은원래ID·버전·input을유지한다.

| kind | input 추가 필드 | 조건 |
| --- | --- | --- |
| play | cardId:string | 본인차례·소유카드·같은숫자/유효무늬 또는 허용공격대응 |
| draw | 없음 | 일반차례에1장받고바로넘김. 낼카드가있어도선택가능 |
| accept-attack | 없음 | 공격중누적장수받고넘김 |
| select-suit | suit:hearts/diamonds/clubs/spades | 본인무늬선택단계 |
| declare-one | 없음 | 본인한장미선언반응창3초내,차례무관 |
| catch-one | targetUserId:계정ID문자열 | 다른활성참가자의한장미선언반응창3초내 |

추가필드·타인카드·잘못된턴·버전·공격대응은거절한다. cardId는본인privateState.hand에서선택한다. 원본프론트의 targetPlayer(좌석숫자) 대신 서버 공개 players.userId 문자열을사용한다. 오목/주사위와같은원시소켓통신이며기존TypeScript의Colyseus형식직접전송은아니다.

## 공개·개인 상태

GAME_STATE.publicState는 명시 허용 필드만 조립하며 손패/뽑기덱을 직렬화하지 않는다.

| 필드 | 의미 |
| --- | --- |
| gameCode/status | ONE_CARD,PLAYING/FINISHED |
| players | [{userId:string,cardCount,active,oneCardUntil:UTC/null,oneCardStatus:none/pending/declared/caught/expired}] |
| turnUserId/turnDeadline/turnTimeLimitMs | 현재ID/UTC마감/30000. 종료시차례·마감null |
| direction/stage/extraAction | 1/-1,PLAYING/CHOOSE_SUIT/FINISHED,K추가행동여부 |
| topCard/activeSuit | 공개바닥{id,suit,rank}/유효무늬 |
| drawCount/attackTotal/lastAttack | 뽑기덱장수/누적공격/마지막공격카드 또는null |
| turnCount | 차례번호 |
| winnerUserIds/endReason/endedAt | 승자ID문자열배열/EMPTY_HAND,STALEMATE,PLAYER_LEFT/UTC종료시각 |

참가자 privateState는 `{userId,hand:[{id,suit,rank}],playableCardIds:[string],canDraw:boolean}`다. 다른참가자의privateState와공유하지않는다. 관전자privateState는항상{}이고관전권한은기존20m/채널검사를거친다. 조커rank는joker-black/joker-color,suit=null이다.

GAME_CONNECTION_STATE의복구state는 `{publicState,privateState}`다. 본인손패·원래턴/무늬선택·마감을복구하며카드를재배분하지않는다. 기권자는ELIMINATED(경기종료후FINISHED)이며다른참가자손패가복구되면안된다.

## 서버 판정

- 일반제출은같은숫자/유효무늬,조커는무관. 공격중에는마지막공격대응표가우선이다.
- 2는+2,A는+3,♠A는+5,흑백/컬러조커는+5/+7. 2뒤에는다른2/같은무늬A/조커/같은무늬3,A뒤다른A/조커,♠A뒤조커,흑백조커뒤컬러조커,컬러조커는대응불가다. 허용된3은누적공격전부방어한다.
- 7/조커는무늬선택,J는다음사람건너뜀,Q는방향전환,K는같은차례추가행동. 2인J/Q는낸사람의새차례와새30초,K연속/무늬선택은원래30초다.
- 손패0장이면마지막특수카드효과보다즉시승리우선. 마지막7/조커도무늬선택없음. 다른사람의순위는추가계산하지않는다.
- 한장확정후3초내선언/신고중서버의첫유효입력만효력. 신고성공시2장벌칙,3초만료만으로자동벌칙없음. 선언반응창은차례제한과구분한다.
- 한차례30초,시간패없음. 만료시F1에따라일반1장/공격누적장수를받고넘긴다. 무늬선택중만료는남은손패최다무늬자동선택후넘기며동률♥♦♣♠순서. K/무늬선택·재접속은기존마감유지.
- 뽑기덱소진시최상단바닥만남기고나머지셔플. 그래도부족하면가능한만큼받고공격종료. 활성참가자한바퀴제출/뽑기모두없으면최소손패승리,동점공동승리(F1우선).20장파산없음.
- 기권하면제외후계속,한명남으면승리. 기권손패의덱환원/제외는아래명시설정에따른다.

## 활성화·정산 경계

local/dev의 `ontop.games.onecard.enabled=true`로 선택 활성화한다(prod/production 혼합 시 제외). dev 환경변수는 `GAME_ONECARD_ENABLED=true`이며 실제 시작에는 [예약 Gateway 연결](committed-game-start.md#켜는-조건)도 필요하다. 기권 손패는 정식 OneCardConfiguration이 REMOVE로 고정한다. 별도 forfeit-hand-policy 설정은 필요하지 않으며 제품 정책 선택에 사용하지 않는다. 기본값은 엔진 꺼짐을 유지한다. 내부 도메인에 남은 RECYCLE 분기는 대안 알고리즘 검사 용도이며 정식 서버 설정으로 활성화하지 않는다.

실제참가/차감커밋을확인한서버만 `OneCardEngine.create(gameId,tableId,List<Long> players)`를호출한다. 외부임의생성/인증우회API없음. 공유GameEngineRouter가다른게임과의중복경기를막는다. OneCardGameFinished는승패판정,DB정산/지급완료가아니다. 메모리기록이며서버재시작/다중서버영속성은별도다.

검증은backend의 `.\gradlew.bat test --tests '*OneCard*'`,실제소켓흐름은flowTest다. 인증/참가확정·시간경계는대역/제어시계,서버엔진·SecureRandom·RawWS·관전·본인손패격리·heartbeat복귀·30초넘김은실제코드다. 테스트의정책은명시적으로선택한조건이며제품정책승인을대신하지않는다.
