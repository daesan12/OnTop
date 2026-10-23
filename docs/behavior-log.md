# 사용자 행동 로그 설계 (초안)

2026-10-23 작성. **팀 합의 전 초안**이다. 여기 적은 이벤트 이름·테이블·엔드포인트는 제안이며, 기존 WebSocket·REST 계약을 바꾸지 않는다. 연결 지점은 2026-10-23 `dev`(445465c) 소스를 기준으로 확인했다.

## 1. 목적

사용자 행동 패턴을 분석해 경험을 개선한다. 로그는 아래 질문에 답할 수 있는 만큼만 모은다. 질문과 연결되지 않는 데이터는 수집하지 않는다.

| 분석 질문 | 필요한 이벤트 | 개선으로 이어지는 예 |
| --- | --- | --- |
| 첫 방문자가 어디서 이탈하나 | 로그인 → 온보딩 → 공원 진입 → 채널 입장 → 첫 착석 → 첫 경기 | 온보딩 단계 축소, 첫 착석 안내 |
| 한 번 접속하면 얼마나 머무나, 다시 오나 | 연결·종료, 채널 입장·퇴장 | DAU·재방문율·평균 체류 시간 |
| 테이블에서 경기까지 얼마나 기다리나, 기다리다 떠나나 | 착석·준비·게임 선택·시작·자리 떠남 | 대기 화면 개선, 빠른 매칭 필요성 판단 |
| 어떤 게임이 인기 있고 끝까지 하나 | 경기 시작·종료(종료 이유)·재접속 | 게임별 규칙·시간 제한 조정 |
| 공원의 어디에 사람이 모이나, 어떤 길로 다니나 | 위치 좌표(움직이는 동안 1초 간격) | 테이블·상점 배치 조정, 첫 착석 안내 |
| 어디서 캐릭터가 걸리나 | 위치 좌표 + 이동 상태 | 맵 충돌·지형 수정 |
| 사람들끼리 얼마나 교류하나 | 채팅·감정표현 횟수(본문 제외), 관전 | 채팅 반경·감정표현 종류 조정 |
| 엽전이 어디서 생기고 어디에 쓰이나 | 경기 정산, 상점 구매·장착 | 상품 가격·판돈 조정 |
| 기기 성능 때문에 떠나는 사람이 있나 | 클라이언트 프레임 보고 + 체류 시간 | 그래픽 품질 기본값 조정 |

## 2. 원칙

- **서버 판정 기준으로 기록한다.** 이동·경기·구매는 이미 서버가 확정한다. 클라이언트 이벤트는 서버가 모르는 것(화면 전환, 프레임 성능)에만 쓴다.
- **성공한 행동만 기록한다.** 요청 수신 시점이 아니라 서버가 성공 처리한 시점에 남긴다. 거절·오류 응답은 기록하지 않는다.
- **게임 처리를 늦추지 않는다.** `TableHub.receive`·`disconnect`는 `synchronized`라서 그 안에서 DB에 쓰면 모든 사용자의 처리가 함께 밀린다. 이벤트는 메모리 큐에 넣고 별도 스레드가 묶어서 저장한다. 큐가 가득 차거나 로거에 오류가 나도 게임 처리는 계속한다 (5장 "유실과 큐 초과").
- **개인정보를 최소화한다.**
  - 채팅 본문은 저장하지 않는다 (기존 계약: "채팅 본문을 서버 로그에 남기지 않는다"). 길이와 수신자 수만 남긴다.
  - 접속권·JWT·쿠키·IP·User-Agent 원문은 남기지 않는다. 기기 분류가 필요하면 클라이언트가 `desktop/mobile` 같은 범주만 보낸다.
  - 닉네임은 남기지 않고 내부 회원 ID(`users.id`)만 쓴다.
- **기존 원장과 겹치지 않게 한다.** 금액은 `wallet_transactions`·`shop_purchases`가 원본이다. 행동 로그에는 참조 ID와 분석용 요약만 둔다.

## 3. 이벤트 목록

공통 필드는 4장 참고. `props`는 이벤트별 추가 값이다. 단계 1은 서버만으로 가능한 것, 단계 2는 클라이언트 수집 API가 필요한 것, 단계 3은 다른 기능 완성에 의존하는 것이다. "상태"는 S15P31B105-140 브랜치 기준 구현 여부다.

체류·착석·대기 시간은 이벤트에 넣지 않고, 분석할 때 짝이 되는 이벤트(입장·퇴장, 착석·떠남, 첫 착석·경기 시작)의 시각 차이로 계산한다. Hub에 시간 추적 상태를 늘리지 않기 위해서다.

### 접속·세션

| event_type | 연결 지점 | props | 단계 | 상태 |
| --- | --- | --- | --- | --- |
| `AUTH_LOGIN` | `AuthExchangePersistenceService.issueExisting` 커밋 후 | `provider` | 1 | 구현 |
| `USER_ONBOARDED` | `UserOnboardingPersistenceService.create` 커밋 후(회원·지갑·Refresh 함께) | `gender`(캐릭터 선택), `provider` | 1 | 구현 |
| `AUTH_LOGOUT` | `Revoked(reason=LOGOUT)` 커밋 후 리스너 | | 1 | 구현 |
| `USER_WITHDRAWN` | `Revoked(reason=MEMBER_DEACTIVATED)` 커밋 후 리스너 | | 1 | 구현 |
| `WS_CONNECTED` | `TableHub.register` | | 1 | 구현 |
| `WS_DISCONNECTED` | `TableHub.disconnect(sessionId, reason)` | `reason`(`ConnectionCloseReason`) | 1 | 구현 |

로그인 계열(sid)은 인증 쪽이 로그에서 원문을 가리므로 `login_session_id`에 SHA-256 앞 32자만 저장한다(`LoginSessionKey`). 같은 로그인의 이벤트를 묶는 용도다.
토큰 재사용 탐지 같은 보안상 세션 폐기(`Revoked(reason=SESSION_REVOKED)`)는 사용자 행동이 아니므로 기록하지 않는다.

### 광장

| event_type | 연결 지점 | props | 단계 | 상태 |
| --- | --- | --- | --- | --- |
| `CHANNEL_JOINED` | `TableHub.joinChannel` 성공(실제 입장만) | `currentUsers` | 1 | 구현 |
| `CHANNEL_LEFT` | `TableHub.leaveChannel` 성공, `disconnect` 정리 | `byDisconnect` | 1 | 구현 |
| `CHAT_SENT` | `TableHub.sendChat` 성공 | `length`(코드포인트), `recipients` | 1 | 구현 |
| `EMOTE_SENT` | `TableHub.sendEmote` 성공 | `emoteCode` | 1 | 구현 |

### 위치 좌표

위치는 이벤트가 아니라 별도 테이블 `world_position_samples`(4장)에 남긴다.

- **간격:** 움직이는 동안 1초. 걷기 6.25m/s·달리기 9m/s 기준으로 표본 사이 6~9m라서 실제 동선을 복원할 수 있다. 5초면 30~45m가 비어 호수·건물을 가로지르는 경로가 된다.
- **대상:** 채널에 입장한 모든 사용자. 입장 직후 스폰 위치를 한 번 남긴다. 움직이기 시작하면 간격과 관계없이 바로 남긴다.
- **구현:** `PositionSampler`가 남길지 정하고, `TableHub.advanceWorld`(물리 tick)와 `joinChannel`(스폰)이 큐에 넣는다. 퇴장·연결 종료 시 기록 상태를 지운다. local 개발 사용자(`dev-…`)는 `user_id`가 NULL이다.
- **생략:** 테이블에 앉아 있는 동안은 남기지 않는다(착석 이벤트로 위치를 안다). 멈추면 `moving=false` 한 행을 남기고 다시 움직일 때까지 생략한다.
- **값:** 서버 물리 계산 결과(`WorldChannelRegistry`의 위치)를 읽는다. `WORLD_MOVE` 입력값이 아니다. 입력은 최대 20회/초이고 실제 위치가 아니라서 남기지 않는다.
- **구역:** 수집할 때 구역을 판정하지 않는다. 구역 경계는 분석 단계에서 파일로 정의하고 좌표를 구역으로 바꿔 집계한다. 경계를 바꾸면 과거 데이터도 다시 계산할 수 있다.
- **예상 양:** 운영 한 달·500명 미만 기준, 500명이 하루 30분씩 30일 접속하고 그중 40%를 움직인다고 넉넉히 잡아도 약 1,000만 행·1GB 안팎이다.

### 테이블·경기

| event_type | 연결 지점 | props | 단계 | 상태 |
| --- | --- | --- | --- | --- |
| `TABLE_JOINED` | `TableHub.join` 새 착석 | | 1 | 구현 |
| `TABLE_LEFT` | `TableHub.leave`, `disconnect`의 좌석 정리 | `byDisconnect` | 1 | 구현 |
| `TABLE_READY_SET` | `TableHub.ready` 상태 변경 | `ready` | 1 | 구현 |
| `GAME_SELECTED` | `TableHub.selectGame` 변경 | `gameCode`, `targetScore`(주사위) | 1 | 구현 |
| `TABLE_WATCHED` | `TableHub.watch` 새 관전 | | 1 | 구현 |
| `GAME_WATCHED` | `watchGame` 첫 상태 전달 | | 1 | 보류(요청 수락 뒤 비동기로 실패할 수 있어 성공 지점 확인 필요) |
| `GAME_STARTED` | `TableHub.applyStartResult` 확정 경기 성공. 참가자마다 한 행. 리허설 확인은 제외 | `gameCode`, `players`, `targetScore`, `betAmountPerPlayer`(1인 예약 판돈) | 1 | 구현 |
| `GAME_ACTION` | `sendGameAction` 성공 후 | `gameCode`, `actionKind` | 보류 | |
| `GAME_ENDED` | 네 엔진 공통 최종 판정 `GameFinished` 리스너. 참가자마다 한 행 | `gameCode`, `endReason`, `players`, `result`(WIN·LOSE·DRAW·FORFEIT), `leaveReason`(중도 이탈 시) | 1 | 구현 |
| `GAME_SETTLED` | `TableHub.roundSettled` | `coinDelta`(본인) | 3 | 정산 작업 후 |
| `GAME_RECONNECTED` | `GameReconnectService` 복구 성공 | | 1 | 미구현 |

`GAME_ACTION`은 수가 많고 게임마다 `input` 구조가 달라서, 분석 질문이 생기기 전까지 수집하지 않는다.
엔진 종료 이벤트에는 시작 시각이 없으므로 경기 시간은 같은 `game_id`의 `GAME_STARTED`와 `GAME_ENDED` 시각 차이로 계산한다.

### 상점

| event_type | 연결 지점 | props | 단계 | 상태 |
| --- | --- | --- | --- | --- |
| `SHOP_PURCHASED` | `ShopService.purchase` 새 구매 커밋 후 | `itemId`, `quantity`, `purchaseId` | 1 | 구현 |
| `ITEM_EQUIPPED` | `ShopService.equip` 커밋 후(`EquipmentChanged`) | `itemId` | 1 | 구현 |

상점은 `ontop.shop.enabled=true`일 때만 동작한다. 같은 구매 키로 다시 요청해 기존 영수증을 돌려주는 경우는 기록하지 않는다.

### 클라이언트 (단계 2)

| event_type | 수집 시점 | props |
| --- | --- | --- |
| `SCREEN_VIEWED` | `App.tsx`의 `page` 변경 | `screen`(`login`/`onboarding`/`park`) |
| `ONBOARDING_STEP` | 온보딩 단계 이동·포기 | `step`, `action` |
| `PERF_REPORT` | 공원 진입 후 1분마다 | `performance/metrics.ts`의 `fps`, `p95`, `slowFrames`, `drawCalls`, `dpr`, `renderer`, 품질 단계 |

로그인 전 화면은 회원 ID가 없으므로 단계 2에서 익명 방문 ID를 둘지 함께 정한다.

## 4. 저장 구조

같은 MySQL에 테이블 하나로 시작한다. 이벤트별 테이블로 나누지 않는다.

```sql
CREATE TABLE behavior_events (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    event_id        BINARY(16)   NOT NULL,           -- 서버 발급 UUID, 중복 저장 방지
    event_type      VARCHAR(48)  NOT NULL,
    schema_version  SMALLINT     NOT NULL,
    source          VARCHAR(8)   NOT NULL,           -- SERVER / CLIENT
    occurred_at     TIMESTAMP(3) NOT NULL,           -- UTC
    user_id         BIGINT       NULL,               -- users.id, 로그인 전·dev 사용자는 NULL
    login_session_id VARCHAR(64) NULL,               -- 로그인 sid (refresh_tokens 계열)
    connection_id   VARCHAR(64)  NULL,               -- WebSocket 연결 단위
    channel_id      VARCHAR(64)  NULL,
    table_id        VARCHAR(64)  NULL,
    game_id         VARCHAR(120) NULL,
    props           JSON         NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_behavior_events_event_id (event_id),
    KEY idx_behavior_events_type_time (event_type, occurred_at),
    KEY idx_behavior_events_user_time (user_id, occurred_at)
);
```

위치 좌표는 행 수가 가장 많으므로 JSON 없이 좁은 테이블에 둔다.

```sql
CREATE TABLE world_position_samples (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    user_id      BIGINT       NULL,
    channel_id   VARCHAR(64)  NOT NULL,
    sampled_at   TIMESTAMP(3) NOT NULL,              -- UTC
    x            FLOAT        NOT NULL,              -- m, 서버 물리 좌표
    y            FLOAT        NOT NULL,              -- 전망대 데크·수영 구분용
    z            FLOAT        NOT NULL,
    moving       BOOLEAN      NOT NULL,
    running      BOOLEAN      NOT NULL,
    swimming     BOOLEAN      NOT NULL,
    map_version  VARCHAR(64)  NOT NULL,              -- WORLD_STATE.mapVersion, 맵이 바뀐 뒤 좌표 구분
    PRIMARY KEY (id),
    KEY idx_world_position_samples_user_time (user_id, sampled_at),
    KEY idx_world_position_samples_channel_time (channel_id, sampled_at)
);
```

- 원장이 아니므로 `users`에 외래키를 걸지 않는다. 탈퇴 처리는 아래 "남은 결정"에서 정한다.
- 마이그레이션은 지갑 작업(V4) 다음 번호인 `V5__create_behavior_events.sql`, `V6__create_world_position_samples.sql`이다.
- 분석이 늘면 월 단위 파티션이나 일별 집계 테이블(`behavior_daily_*`)을 추가한다. 처음부터 만들지 않는다.

## 5. 수집 흐름

```
TableHub / ShopService / Auth 서비스
  → BehaviorLogger.record(event)        // 메모리 큐에 넣고 즉시 반환
  → 저장 스레드: 1초 또는 500건마다 묶어서 INSERT
  → behavior_events
채널 물리 스레드: 1초마다 움직이는 사용자의 위치를 같은 큐에 넣음
  → world_position_samples
클라이언트 → POST /api/v1/behavior-events (단계 2, 인증 필요, 묶음 전송)
```

- 커밋 후에만 의미가 있는 이벤트(로그아웃, 탈퇴, 구매, 장착)는 `@TransactionalEventListener(AFTER_COMMIT)`로 받는다. 저장소에는 `MemberWebSocketConnections.revoked`가 같은 방식을 쓴다.
- `TableHub` 안의 이벤트는 직접 `BehaviorLogger.record`를 부른다. 큐에 넣기만 하므로 잠금 시간이 늘지 않는다.
- 기능 플래그 `ontop.behavior-log.enabled`(환경변수 `BEHAVIOR_LOG_ENABLED`)로 켠다. 기본값은 꺼짐이며, 켰는데 db 프로필이 없으면 시작을 실패시킨다.
- 기록 호출은 `behaviorLog.record(() -> BehaviorEvent.builder(...)...build())` 형태다. 꺼져 있으면 값을 만들지 않고, 만드는 중 오류가 나도 호출한 쪽으로 던지지 않는다.

### 유실과 큐 초과

행동 로그는 원장이 아니라 분석용 표본이다. 금액·보유의 원본은 `wallet_transactions`·`shop_purchases`이므로 행동 로그가 일부 빠져도 지갑·구매 결과는 영향받지 않는다. 그래서 **게임 처리를 지키는 쪽을 우선하고, 유실은 건수로 남겨 분석에서 보정한다.**

| 상황 | 처리 | 허용 유실 |
| --- | --- | --- |
| 평상시 | 1초 또는 500건마다 묶어서 INSERT | 없음 |
| 정상 종료 (배포·재시작) | 새 기록을 막고 남은 큐를 최대 5초 동안 저장한 뒤 종료. 운영 compose의 `stop_grace_period: 30s` 안에서 끝난다 | 5초 안에 못 쓴 나머지 |
| 비정상 종료 (강제 종료·메모리 부족) | 처리 불가 | 큐에 남아 있던 이벤트. 평상시 최대 약 1초분 |
| DB 저장 실패 | 같은 묶음을 최대 3번 재시도(1초·2초·4초 간격). 그래도 실패하면 그 묶음을 버림. 재시도 중에도 큐는 계속 받는다 | 실패한 묶음 |
| 큐 초과 | 아래 참고 | 초과분 |

**큐 초과 처리**
- 큐는 크기 제한이 있다 (제안: 20,000건, 설정값). 예상 최대 유입은 초당 수백 건이라 DB가 약 30초 이상 멈춰야 찬다.
- 큐에 넣을 때 기다리지 않는다 (`offer`). 자리가 없으면 그 이벤트를 즉시 버리고 반환한다.
- 큐가 80% 이상 차면 위치 좌표를 먼저 받지 않는다. 행수가 가장 많고 한 건의 가치가 가장 낮기 때문이다. 접속·경기·구매 같은 이벤트는 100%까지 받는다.
- `record(...)`는 내부의 모든 `RuntimeException`을 잡아서 호출한 쪽으로 던지지 않는다. 로거 오류로 `TableHub`나 상점 처리가 실패하지 않는다.

**유실 기록**
- 버린 건수(초과·저장 실패·종료 시 미저장)는 이유별로 Micrometer 카운터로 노출한다 (`ontop.behavior.dropped{reason=...}`). 큐 적재량도 함께 노출한다.
- 같은 내용을 1분에 최대 한 번 WARN 로그로 남긴다. 건마다 로그를 남기면 로그가 다시 부하가 되기 때문이다.
- 분석할 때 유실이 있었던 시간대는 지표에서 표시한다.

**위치 기록과 물리 tick**
- `TableHub.advanceWorld`는 이미 받은 `WorldState` 목록에서 사용자별 마지막 기록 시각만 비교해 큐에 넣는다. DB 접근·대기·추가 잠금이 없다.
- 위치 기록 중 오류가 나도 tick은 계속 진행한다.

## 6. 단계

1. **서버 단계 1:** 테이블·Logger·접속·광장·테이블 이벤트·위치 좌표. 첫 분석은 퍼널(로그인 → 첫 경기), 체류 시간, 테이블 대기 시간, 위치 히트맵.
2. **클라이언트 단계 2:** 수집 API, 화면 전환, 프레임 보고.
3. **정산 단계 3:** 정산 Gateway가 생기면 `GAME_SETTLED`를 연결한다.
4. **분석:** SQL 기반 지표 쿼리 정리 → 필요하면 대시보드. 쿼리·검증 도구와 실행 방법은 [analytics/README.md](../analytics/README.md)(S15P31B105-178).

## 7. 확인한 제약

- 경기 종료는 네 엔진이 공통으로 발행하는 `GameFinished`를 받으므로 정산과 무관하게 기록할 수 있다. 운영에서 각 엔진이 켜져 있는지는 확인이 필요하다. 반면 `GameFinishedResultListener`는 `@Profile("local")`이고, 운영 코드에는 `GameResultCommitted`를 만드는 곳이나 `GameResultGateway` 구현이 없다. 그래서 정산 금액(`GAME_SETTLED`)은 정산 담당 작업이 끝나야 기록할 수 있다.
- `wallets`·`wallet_transactions`는 JPA 엔티티만 있고 운영 DDL은 아직 없다 (테스트 fixture에만 존재). 지갑 적립 경로도 없다.
- 방·좌석·채널·경기 상태는 모두 메모리에 있다. 서버를 다시 시작하면 열려 있던 착석·경기의 종료 이벤트가 남지 않으므로, 분석할 때 "종료 없는 시작"을 따로 처리해야 한다.
- 인증을 끈 local 모드의 사용자는 `dev-UUID` 형식이고 `accountId`가 없다. 이때 `user_id`는 NULL로 남긴다.

## 8. 남은 결정 (팀 협의)

| 항목 | 제안 |
| --- | --- |
| 사용자 고지 | 팀 내 수집 합의는 완료(2026-10-23 확인). 서비스 사용자(교육생)에게 보여줄 안내 문구와 위치(온보딩 화면 등)만 정한다 |
| 탈퇴한 회원의 로그 | 탈퇴 시 `user_id`를 NULL로 바꾸는 익명화 제안. 완전 삭제와 비교 필요 |
| 보관 기간 | 운영 예정 기간이 약 한 달이므로 운영 기간 동안 원본 전체를 보관하고, 종료 후 처리 방식을 정한다 |
| 분석용 구역 경계 | 수집과 무관하므로 분석 단계에서 정한다. 프론트 `config/parkLayout.ts`를 참고한다 |
| Jira 등록 | 팀 동의로 `[DATA]` Epic을 새로 만든다(2026-10-23). Story는 `[PLAN]`·`[BE]`·`[FE]` 접두어를 쓴다 |

## 9. 담당자 협의 결과 (2026-10-23)

| 항목 | 결과 | 반영 방법 |
| --- | --- | --- |
| Flyway 번호 | 지갑 스키마 작업이 다음 번호를 먼저 쓴다 | 지갑 작업 머지 후 최신 `dev`에서 중복을 확인하고 번호를 정한다 |
| `UserOnboardingPersistenceService.create()` | 지갑 생성·최초 지급 작업과 겹친다 | 가입 로그는 지갑 작업 머지 후 넣는다. 커밋 후에만 기록한다 |
| `TableHub` | 성공한 행동만, 큐 초과·로거 오류에도 게임 계속, 위치 기록이 tick을 막지 않을 것 | 2장 원칙, 5장 "유실과 큐 초과" |
| 구매 로그 | 커밋 성공 후 기록, 같은 구매 요청 재전송은 중복 집계하지 않음 | 구매 키로 기존 영수증을 돌려주는 경우는 기록하지 않는다 |
| `EquipmentChanged.itemId` | 추가 승인. 기존 생성자와 의상 동기화 동작 유지 | `EquipmentChanged(long userId)` 생성자를 남기고 `itemId`를 추가한다. `ShopWorldAppearanceGateway`는 수정하지 않는다 |
| `Revoked` 구분 값 | 인증 담당 승인. 기존 사용처 호환 유지 | `Reason`(LOGOUT·SESSION_REVOKED·MEMBER_DEACTIVATED)을 추가하고 기존 2개 인자 생성자·`sessionRevoked(userId, sid)`를 남긴다. 로그아웃만 LOGOUT을 넘긴다 |
| 메모리 큐 유실 | 허용 범위와 초과 처리를 문서에 명시할 것 | 5장 "유실과 큐 초과" |
