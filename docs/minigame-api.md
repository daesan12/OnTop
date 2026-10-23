# 붕어빵 미니게임 API

기준: [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71), Notion MINI-01~04(2026-10-23 조회), ERD의 minigame_sessions. 회원 로그인 JWT를 기존 REST 인증으로 검증하며 임의 userId/score/rewardAmount는 받지 않는다. 모든 응답은 Cache-Control: no-store다.

## 범위와 실행

- `local,db`, `ontop.minigames.enabled=true`일 때 JPA 서비스가 활성화된다. 기본 비활성이고 미설정 서비스는 503 MINIGAME_NOT_CONFIGURED다. 운영 활성화·공통 DB 스키마 배포는 이번 작업에 포함하지 않는다.
- 공통 users/wallets/wallet_transactions를 재사용한다. 명시적으로 Flyway locations에 `classpath:db/minigame`을 추가하면 V110이 minigame_sessions와 시작 중복 요청 영수증 minigame_start_requests를 생성한다. 기존 마이그레이션·공통 지갑 DDL은 수정하지 않는다.
- 최신 dev 통합 후 공통 지갑은 기본 `db/migration`의 V4를 사용한다. 신규 검증 DB에는 이전 V99/V101 상점 지갑 fixture를 함께 적용하지 않는다. 기존 DB에 적용된 이력·체크섬은 변경하지 않으며 운영 DB를 자동 변경하지 않는다.
- minigame_sessions는 ERD의 id/user_id/minigame_type/status/score/reward_amount/started_at/ended_at에 맞춘다. 영수증은 API 멱등성을 위한 보조 테이블이다.
- 실제 굽기 입력·서버 성공 판정은 명세에서 미정이다. `VerifiedMinigameResultSource.findCompletedCount(userId, sessionId)`에 서버가 검증·보관한 해당 세션의 최종 성공 개수를 연결해야 보상을 지급한다. 등록된 구현이 없거나 검증 결과가 없으면 409 MINIGAME_NOT_VERIFIED이며 돈/상태를 변경하지 않는다. 프론트 점수·단순 경과 시간·테스트 결과를 검증 근거로 쓰지 않는다.

## MINI-01 · 시작

POST `/api/v1/minigames/sessions`. `Idempotency-Key: 1~64자리 영숫자/_/-` 필수. 로그인 사용자의 지갑 행 잠금 안에서 세션/영수증을 함께 생성한다. 같은 회원·같은 키는 최초 201 응답을 재현하며 다른 회원의 같은 키는 별도다. 현재 지원 입력은 아래 한 종류이며 미지원 종류/추가 필드는400이다. 키 필수화는 명세의 시작 재전송 제안을 구현한 계약이다.

```json
{"minigameType":"BUNGEOPPANG"}
```

201 응답:
```json
{
  "minigameSessionId": "901",
  "minigameType": "BUNGEOPPANG",
  "status": "PLAYING",
  "startedAt": "2026-10-23T00:10:00Z"
}
```

시작은 지갑 잔액/예약금/거래 원장을 변경하지 않는다. 종료된 세션의 같은 시작 키도 최초 생성 응답을 반환하며 현재 상태는 MINI-02로 조회한다. 새 플레이는 새 키를 사용한다. 동시 진행 세션 수·유효시간·시간당 상한은 임의로 정하지 않았다.

## MINI-02 · 본인 상태 조회

GET `/api/v1/minigames/sessions/{minigameSessionId}`. 양수 BIGINT의 문자열 ID. 타인/없는 세션은 동일404 MINIGAME_NOT_FOUND다.

```json
{
  "minigameSessionId": "901",
  "status": "PLAYING",
  "score": null,
  "rewardAmount": 0,
  "startedAt": "2026-10-23T00:10:00Z",
  "endedAt": null
}
```

PLAYING/COMPLETED/ABANDONED/INVALID를 표현하며 진행 중 최종 점수/완료 시각은 null. 완료 후 score는 서버 검증 완료 개수다.

## MINI-03 · 완료·보상 확정

POST `/api/v1/minigames/sessions/{minigameSessionId}/complete`, JSON body `{}`. 회원/세션 범위를 검사하고 지갑 행 → 세션 행을 잠근다. 이미 COMPLETED이면 검증 모듈을 재호출하거나 재지급하지 않고 같은 결과를 반환한다.

```json
{
  "minigameSessionId": "901",
  "status": "COMPLETED",
  "verifiedCompletedCount": 3,
  "rewardAmount": 2
}
```

서버 검증 개수3개당2엽전. 최종 개수는0 이상의 안전 정수여야 한다. 잔여1~2개 폐기/이월 정책이 미정이므로 3의 배수가 아닌 결과는409 MINIGAME_POLICY_REQUIRED로 보류하고 PLAYING/잔액을 유지한다. 이 보류를 제품의 잔여 폐기 정책으로 취급하지 않는다.

세션 COMPLETED·지갑 증가·MINIGAME_REWARD 원장을 같은 트랜잭션으로 저장한다. 원장 키 `minigame-reward:{sessionId}` 고정, minigame_session_id 참조, game_session_id/item_id는null. reserved_balance는 변경하지 않는다. 보상0은 거래 원장 없이 완료한다. 검증 조회는 지급하지 않고 결과는 해당 세션에 고정된 불변 값이어야 한다. 원장 저장 실패는 세션/지갑도 롤백한다.

## MINI-04 · 중도 포기

POST `/api/v1/minigames/sessions/{minigameSessionId}/abandon`, JSON body `{}`.

```json
{"minigameSessionId":"901","status":"ABANDONED","rewardAmount":0}
```

PLAYING→ABANDONED이며 보상 없음. 같은 포기는 동일 결과. COMPLETED 포기는409 MINIGAME_ALREADY_COMPLETED, ABANDONED 완료는409 MINIGAME_ALREADY_ABANDONED다. 완료/포기 경합은 같은 지갑·세션 잠금으로 최종 상태 하나만 확정한다.

## 오류

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | UNSUPPORTED_MINIGAME | 미지원 미니게임 종류 |
| 400 | INVALID_REQUEST | 잘못된 종류/키/ID/JSON·금지 필드 |
| 401 | UNAUTHENTICATED | 로그인 필요, 실제 인증 오류는 기존 공통 규격 |
| 404 | MINIGAME_NOT_FOUND | 본인 세션 없음 |
| 409 | MINIGAME_NOT_VERIFIED | 서버 검증 결과 없음/유효하지 않은 개수 |
| 409 | MINIGAME_POLICY_REQUIRED | 잔여1~2개 처리 정책 미정 |
| 409 | MINIGAME_ALREADY_COMPLETED | 완료된 세션 포기 차단 |
| 409 | MINIGAME_ALREADY_ABANDONED | 포기한 세션 완료 차단 |
| 409 | MINIGAME_ALREADY_FINISHED | 기타 종료 상태 변경 차단 |
| 503 | MINIGAME_NOT_CONFIGURED | 미니게임 DB 서비스 비활성 |
| 503 | MINIGAME_UNAVAILABLE | 저장 실패/지갑 부재/범위 초과 등 |

## 남은 연동·협의

- 서버 굽기 입력·성공 판정 방식/실제 프론트 플레이 결과 → VerifiedMinigameResultSource 연결.
- 남은1~2개 폐기/세션 간 이월 및 보상0 완료의 사용자 흐름.
- 진행 세션 수·만료·시간당 상한이 필요하면 별도 정책 확정. 현재 임의 제한 없음.
- 공통 지갑의 같은 행 잠금·원장 키/세션 FK 최종 DDL을 DB 담당과 맞춘다.

API/DB 저장 구현과 실제 굽기 게임·외부 OAuth·운영 적용 완료는 구분한다. MySQL 검증에서 검증 결과 소스만 대역으로 제공한다.

## MySQL 검증 결과 · 2026-10-23

Java 21에서 `mysqlTest --tests '*MinigameMySqlTests'`를 실행해 7개 모두 통과했다(실패·오류·스킵 0). 기존 MySQL 8.4 컨테이너의 새 `ontop_minigame_test_` 전용 스키마만 사용했으며 기존 서비스·상점 검증 스키마는 변경하지 않았다.

- 시작·본인 조회·미검증 완료 거절·서버 결과 지급·중복 완료 HTTP/DB 확인
- 같은 키 동시 시작 시 세션 하나 생성
- 동시 완료 6건의 보상 한 번 지급
- 완료/포기 경합의 최종 상태·지급 일치
- 원장 저장 실패 시 세션·지갑 롤백 후 재시도 성공
- 미확정 잔여 정책·포기 재시도 시 미지급
- 상점 구매와 미니게임 보상의 동시 지갑 증감 보존

실제 JPA·MySQL 행 잠금·트랜잭션을 검증했으며 성공 개수 제공만 테스트 대역이다. 실제 붕어빵 판정 연동이나 운영 배포가 완료됐다는 의미는 아니다.
