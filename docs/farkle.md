# 주사위 한 판 · DICE

수신 자료 `ontap-game-rules-without-gomoku-20261021.zip`의 `rules/03_farkle.md`와 2026-10-21 사용자 결정을 적용한다. 2인, 공정한6면체 주사위6개, 무작위 선공. 시작 전에 서버가 목표2000/4000/6000점(기본 권장4000)을 확정한다. Bank로 총점이 목표 이상이면 즉시 승리하며 상대 추가 차례는 없다.

## 입력

기존 GAME_ACTION_SEND payload `{gameId,actionId,expectedVersion,input}`을 사용한다.

```json
{"requestId":"dice-1","type":"GAME_ACTION_SEND","payload":{"gameId":"실제-주사위-경기-ID","actionId":"dice-roll-1","expectedVersion":0,"input":{"kind":"roll","selectedIds":[]}}}
```

| input | 조건 |
| --- | --- |
| `{"kind":"roll","selectedIds":[]}` | 새 차례 첫 굴림 |
| `{"kind":"roll","selectedIds":[0]}` | 0번이 득점할 때 선택을 보관하고 나머지 재굴림 |
| `{"kind":"bank","selectedIds":[0,1,2]}` | 선택 전체가 득점할 때 이번턴 누적+선택 점수를 총점에 저장 |

selectedIds는 중복 없는0~5 정수 배열. 첫 굴림 이후에는 현재 굴림의 득점 선택이 하나 이상 필요하다. held=true 주사위 재선택·눈/점수/승자 주입은 거절한다. 선택은 프론트 표시용이며 roll/bank 때 서버가 확정한다. 이전 굴림의 보관 주사위와 새 주사위를 합쳐 새 조합을 만들 수 없다.

## 상태

GAME_STATE.publicState이며 참가자·관전자 privateState는 모두 `{}`. 관전은 기존 채널·테이블 중심20m 검사를 거친다.

| 필드 | 설명 |
| --- | --- |
| gameCode/status | DICE, PLAYING/FINISHED |
| players/scores | 좌석순 계정 ID 문자열/저장 총점 배열 |
| targetScore/turnTimeLimitMs | 목표/30000 |
| turnUserId/turnDeadline | 현재 차례 ID/UTC 마감. 종료 시 null |
| turnScore | 이전 굴림에서 확정한 이번턴 누적. 아직 프론트에서 선택 중인 점수 미포함 |
| dice | `[{id:0,value:1,held:false},...]`. 새 차례 첫 굴림 전 [] |
| stage | AWAITING_ROLL/SELECTING/FINISHED |
| rollId/round | 전체 굴림 횟수/차례 번호(1부터) |
| hotDice/lastEvent | 최근 굴림이 핫 다이스인지/START,ROLL,HOT_DICE,BANK,BUST,TURN_TIMEOUT |
| winnerUserId/endReason/endedAt | 승자/TARGET_REACHED 또는 RECONNECT_EXPIRED/종료 시각 |

BUST·BANK 후 새 차례 상태를 즉시 보낸다. 프로토타입의 ROLLING/BUST 연출 대기 단계는 서버에 없으며 프론트는 rollId/lastEvent로 연출한다. 기존 TypeScript FarkleState의 직접 복사가 아니므로 이 서버 계약으로 변환한다.

## 점수와 시간

| 조합 | 점수 |
| --- | --- |
| 1 하나/5 하나 | 100/50 |
| 같은 눈3개 | 1은1000, 그 외 눈×100 |
| 같은 눈4/5/6개 | 같은 눈3개 점수×2/4/8 |
| 12345/23456/123456 | 500/750/1500 |

선택 전체를 겹치지 않는 득점 조합으로 나눈 최대합을 적용한다. 세쌍 보너스·최소 저장점수 없음. 득점 조합이 하나도 없으면 BUST로 이번턴만 잃고 상대 차례가 된다. 6개를 모두 득점에 쓰면 이번턴 유지·6개 재굴림(HOT DICE). 저장 총점은 BUST로 줄지 않는다.

**한 차례 전체30초**. 재굴림·잘못된 입력·재접속으로 연장하지 않는다. 정각부터 만료이며 이번턴 점수만 잃고 차례를 넘긴다. 시간패로 경기를 종료하지 않는다. 지연된 타이머도 원래 마감 기준으로 경과한 차례를 반영한다. 재접속30초 유예 만료의 기권은 별도다.

사용자 최신 결정은 오목 이외 게임30초·만료 시 넘김이다. 차오차오 기존5초굴림/12초선언/7초판단 원문과 구분하며, 차오차오 구현 시 입력 단계별30초·굴림/선언 만료는 해당 차례 종료·판단 만료는 해당 판단 넘김으로 적용한다. 수신 원문을 변경하지 않는다.

## 서버 연결과 검증

local에서 `ontop.games.farkle.enabled=true`로 선택 활성화(기본 꺼짐). `FarkleEngine.create(gameId,tableId,List<Long> players,int targetScore)`는 실제 참가·차감 커밋을 확인한 서버 내부 호출 전용이다. 임의 생성 API는 없다. 오목과 함께 켜면 GameEngineRouter가 gameId로 분기하며 참가자/테이블의 중복 진행을 막는다.

FarkleGameFinished는 서버 승패 알림이며 정산 완료가 아니다. 실제 저장·정산 후 기존 GameResultGateway/GameResultCommitted를 연결한다. 엔진·중복 기록은 메모리이며 재시작·다중 서버 영속성·종료 알림 전달 보장은 제공하지 않는다.

backend에서 `.\gradlew.bat test --tests '*Farkle*'` 또는 flowTest로 점수표·전체 눈 조합·잘못된 선택·버스트·핫 다이스·즉시승리·동시 중복·30초 경계와 실제 Spring/Raw WS 관전·heartbeat 복귀·자동 넘김·오목 전환을 검증한다. 인증/참가 확정은 테스트 대역, 시간은 제어 시계이며 실제 로그인·차감·지급/DB·운영 적용 검증은 아니다.
