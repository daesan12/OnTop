# OnTop 신규 게임 Backend 구현 가이드 (1차 초안)

> 기준: 2026-10-31 업로드된 프로젝트 복제본. 실제 작업 전 최신 `dev` 및 운영 설정을 재확인한다.
> 목적: 게임별 담당자가 디자인·프론트·백엔드를 독립 구현하면서 공통 시스템을 재사용하고 병렬 개발 충돌을 줄인다.
> 기존 Java 스타일 가이드: `docs/conventions/backend-code.md` (중복 작성하지 않음).

## 1. 반드시 지킬 핵심 규칙

1. **게임별 코드 격리:** 게임 규칙, 상태, 엔진, 설정, 테스트는 `game/{game}/` 이하에 두는 것을 우선한다.
2. **공통 진입점 사용:** 게임 통신·상태 조회·복구는 기존 `GameEngine` 및 공통 WebSocket 경로를 사용한다. 게임별 최상위 WS 프로토콜을 임의로 만들지 않는다.
3. **예약/정산 분리:** 엔진은 판정 및 경기 종료 결과를 생성한다. 지갑 잔액·예약·정산을 게임 엔진에서 직접 변경하지 않는다.
4. **공통 파일 최소 변경:** 공통 모듈의 동작을 수정할 때는 기존 extension point로 해결 가능한지 먼저 확인한다. 공통 수정은 담당자에게 공유한다.
5. **Flyway 불변:** 적용된 migration 파일을 수정·삭제하지 않는다. 변경은 새 버전 migration으로 작성한다.
6. **비공개 상태 보호:** 관전자에게 플레이어 전용 `privateState`를 노출하지 않는다.
7. **재접속·중복 요청·종료 멱등성을 테스트한다.** 코드 동작뿐 아니라 공통 시작/정산 흐름에 문제가 없는지 확인한다.

## 2. 기존 게임별 구현 패턴

| 게임 | 코드 | 주요 엔진 | 상태·규칙 | 설정 |
|---|---|---|---|---|
| 오목 | `OMOK` | `game/omok/service/OmokEngine.java` | `game/omok/domain/OmokMatch.java` | `OmokConfiguration.java` |
| 원카드 | `ONE_CARD` | `game/onecard/service/OneCardEngine.java` | `OneCardMatch.java` | `OneCardConfiguration.java` |
| 파클 | `DICE` | `game/farkle/service/FarkleEngine.java` | `FarkleMatch.java` | `FarkleConfiguration.java` |
| 다리 | `LIAR_BRIDGE` | `game/bridge/service/BridgeEngine.java` | `BridgeMatch.java` | `BridgeConfiguration.java` |

- 공통 계약: `GameEngine extends GameActionGateway, GameStateGateway, GameRecoveryGateway` (`game/engine/GameEngine.java`).
- 각 엔진은 경기 생성 시 `GameEngineRouter.register(...)`를 호출한다. 종료 시 `GameEngineRouter.finished(...)`로 점유 상태를 해제한다.
- 상태 갱신 시 `GameStateChanged` 이벤트를 발행하며, 종료 시 게임별 이벤트와 `GameLifecycle.finished(...)`에서 생성한 공통 종료 이벤트를 발행하는 패턴이다.
- 원카드·다리는 `privateState`를 별도 구성한다. 게임별 비공개 정보가 없다면 빈 객체가 가능하다.
- 게임별 `Configuration`에서 활성화 조건과 타이머를 정의한다. 신규 게임 설정도 기존 프로필 및 속성 조건을 준수한다.

### 신규 게임 권장 패키지

```text
backend/src/main/java/com/ssafy/ontop/game/{newgame}/
├── config/{NewGame}Configuration.java
├── domain/{NewGame}Match.java
└── service/{NewGame}Engine.java
```

규칙이 복잡한 경우 `domain/`에 순수 규칙 클래스를 추가한다. 공통 인프라 서비스를 게임별로 복사하지 않는다.

## 3. 파일 소유권 및 충돌 방지

| 등급 | 예시 파일 | 작업 원칙 |
|---|---|---|
| 🟢 게임 담당자 소유 | `game/{newgame}/**`, 대응하는 게임별 테스트, 게임별 프론트 컴포넌트 | 담당자 주도 수정; 해당 폴더 내부로 변경을 한정 |
| 🟡 통합 시 공동 수정 | `table/domain/TableGame.java`, `game/start/CommittedGameStartService.java`, `game/result/persistence/VerifiedGameFinish.java`, `GameStartCommand.java`/`GameReservationRequest.java`(필요 시), FE `GamePanel.tsx`, `protocol.ts`, `store.ts`, `tableLobby/model.ts` | 변경 전에 담당자와 공유; MR 병합 직전 최신 `dev` 기준 검증 |
| 🔴 공통 인프라 | `GameEngineRouter.java`, `GameEngineGateways.java`, TableHub/공통 WS 라우팅, 지갑·정산 persistence, 기존 Flyway 파일 | 임의 수정·복제 금지 원칙; 필요하면 영향 범위·대안·테스트 계획을 먼저 합의 |

*등급은 제안하는 팀 운영 정책이며, 저장소가 자동으로 강제하는 권한 체계는 아니다.*

## 4. 새로운 gameCode 연결 체크리스트

- [ ] FE/BE에서 동일한 `gameCode` 문자열 사용 (`OMOK`, `ONE_CARD`, `DICE`, `LIAR_BRIDGE` 같은 기존 명명 방식 준수)
- [ ] `table/domain/TableGame.java`에 인원 규칙 추가·검토
- [ ] `CommittedGameStartService.supported()`에 엔진 가용성 및 인원·게임별 설정 검증 추가
- [ ] `CommittedGameStartService.activate()`에 신규 엔진 생성 연결
- [ ] 엔진 `create()`가 동일 ID의 재호출을 안전하게 처리하고, 다른 참가자·테이블로 생성하려는 요청은 거절하도록 구현
- [ ] `VerifiedGameFinish.REASONS`에 신규 종료 사유 등록 및 공통 승패·무효 판정 규칙과의 호환성 검토
- [ ] `GameStartCommand`, `GameReservationRequest`의 기존 특정 게임 전용 필드/검증이 신규 게임과 충돌하는지 확인
- [ ] DB `game_sessions` CHECK 제약의 gameCode, 인원, target_score 호환성 확인; 변경 필요 시 신규 migration 작성
- [ ] FE 테이블 로비/게임 패널/프로토콜 및 상태 저장소 연결
- [ ] 게임 활성화 설정, 프로필, 환경변수 등 검토
- [ ] 경기 생성 → action → 종료 → 결과 저장 → 정산 → 재접속/관전 검증

## 5. 액션·상태·이벤트 구현

- 기존 `GAME_ACTION_SEND` 계약을 우선 사용한다. 게임별 세부 동작은 `input`에 표현한다.
- `actionId` 중복 요청 방어 및 `expectedVersion`에 의한 낡은 입력 거절을 기존 엔진 패턴대로 구현한다.
- 요청 사용자 ID는 인증/공통 게이트웨이에서 제공되는 정보를 따른다. 클라이언트가 보낸 플레이어 ID를 신뢰해 권한 확인을 생략하지 않는다.
- 버전은 유효한 상태 변경 후 일관되게 증가해야 한다. 상태가 바뀌지 않는 재요청에 이벤트와 정산을 중복 발행하지 않는다.
- `publicState`는 플레이어와 관전자가 볼 수 있는 정보만, `privateState`는 해당 사용자에게만 허용된 정보만 포함한다.
- `GameStateChanged`, `GameLifecycle.finished(...)`의 기존 패턴을 재사용하며 종료 이벤트의 `gameId`, `tableId`, version, 참가자, 결과, 종료 사유를 공통 검증과 일치시킨다.
- `GameEngineRouter`는 라우팅과 진행 중 테이블·사용자 점유를 관리한다. 새 게임 때문에 별도 라우터를 만들지 않는다.

## 6. DB 및 Flyway 필수 규칙

### 6.1 신규 migration이 필요한 경우
- `game_sessions` CHECK에 허용 게임 코드/참가 인원이 하드코딩되어 신규 게임을 거절하는 경우.
- 실제 영속 저장이 필요한 새 데이터나 제약조건이 발생한 경우.
- 공통 종료·정산 모델에 데이터베이스 변경이 필요한 경우(가능한 공통 모델 재사용 우선).

### 6.2 migration이 필요하지 않을 수 있는 경우
- 게임 로직, 턴, 보드 상태, 일시적 엔진 메모리 상태만 추가하는 경우.
- 기존 테이블 및 컬럼으로 시작·예약·결과·정산을 표현할 수 있는 경우.

### 6.3 번호 및 적용 위치
- 파일명은 `V<숫자>__<lower_snake_case>.sql` 형태를 따른다.
- 프로젝트 내 `backend/src/main/resources/db/**/V*.sql`을 모두 검색한다. **서로 다른 위치라도 활성화한 Flyway locations에 함께 포함되면 같은 버전을 중복 사용할 수 없다.**
- 업로드본에는 `db/migration`, `db/minigame`, `db/notes`, `db/shop`, `db/feedback` 등의 버전 파일이 있으며 최대 `V130`이 확인된다. 이 숫자는 작성 시점의 신규 번호를 보장하지 않는다.
- `application-db.yml`의 기본 DB 설정은 `DB_MIGRATION_LOCATIONS`를 사용하고, dev+db 프로필에는 `db/migration,db/minigame`을 지정하는 별도 블록이 있다. 따라서 **실제 프로필/환경변수에 따라 적용 위치가 다르다.**
- migration 번호는 최신 `dev`와 다른 담당자 MR을 확인한 후 확정한다. 번호가 선점되어 있으면 기존 파일을 덮지 않고 새 버전으로 재작성한다.
- 이미 실행된 migration을 수정·삭제하지 않는다. 개발 환경에서도 checksum 오류를 임의 복구하거나 전체 DB를 초기화하여 숨기지 않는다.
- 스키마 변경은 MySQL 8.4 환경에서 실제 migration 및 후속 기능 테스트로 검증한다.

### 6.4 CHECK 변경 예시(설명용, 실행 SQL 아님)
기존 `V112__create_game_sessions_and_participants.sql`에는 `OMOK`, `DICE`는 2인, `ONE_CARD`, `LIAR_BRIDGE`는 2~4인으로 검사하는 `ck_game_sessions_players`가 있다. 신규 게임 추가 시 **새 migration에서 기존 CHECK를 제거하고 수정된 CHECK를 다시 정의**하는 변경을 검토한다. MySQL 버전에 맞는 정확한 DDL은 현행 schema를 확인한 뒤 작성한다.

### 6.5 검증 순서
- [ ] 최신 `dev` 기준 번호·적용 location 확인
- [ ] 기존 migration 파일 미변경 확인
- [ ] 새 환경에서 migration 성공 확인
- [ ] 이미 적용된 DB에서 순차 migration 성공 확인(가능한 경우)
- [ ] 게임 시작/종료/정산 MySQL 통합 테스트
- [ ] 기존 게임의 INSERT/정산이 새 CHECK에 의해 거절되지 않는지 확인

## 7. 예약·정산 및 재접속

- `CommittedGameStartService` 주석 및 로직 기준: **참가자의 판돈 예약 저장이 커밋된 뒤에만 엔진을 생성**한다. 경기 시작 시 즉시 잔액 차감을 임의 구현하지 않는다.
- 경기 결과·승패는 엔진이 판정하되, 재화 변경은 기존 게임 결과/settlement persistence 서비스가 담당한다.
- 게임 종료 후 동일 이벤트가 재전달되거나 재접속/시간초과가 경쟁해도 정산이 중복되지 않도록 기존 경로를 유지한다.
- 상태 재조회·복구 경로를 구현하고, 접속 끊김/재접속/종료 경합을 테스트한다.
- **주의:** 기존 엔진은 경기 진행 상태를 주로 메모리에 보관한다. DB에 세션·정산 기록이 존재한다는 사실만으로 서버 프로세스 재시작 시 게임 전체 상태가 자동 복구된다고 단정해서는 안 된다. 서버 재기동 복원은 별도 요구사항·설계·검증 대상이다.

## 8. 테스트 및 MR 규칙

기존 `docs/conventions/backend-code.md`에 정의된 `*Tests` 클래스명 및 한글 테스트명 규칙을 준수한다.

| 변경 범위 | 기본 검증 |
|---|---|
| 게임 전용 규칙/엔진 | 규칙 단위 테스트, 액션 중복/버전/권한/종료/타임아웃/관전 테스트 |
| 게임 시작 연결 | 게임 시작 + Table + wallet 예약 흐름 테스트 |
| 종료/결과/정산 | 중복 종료, 결과 검증, winner/forfeit, 정산 및 재시도 관련 테스트 |
| WS/복구 계약 | 상태 수신, 재접속, 관전 시 정보 노출 방지, FE 계약 테스트 |
| Flyway/DB | MySQL 8.4 migration 및 관련 DB 통합 테스트 |
| 공통 모듈 수정 | 관련 게임 회귀 테스트 확장; 광범위한 변경은 전체 테스트 권장 |

MR 설명에 반드시 포함할 내용: `gameCode`, 담당 게임 폴더, **수정한 공통 파일 목록**, 신규 Flyway 버전/위치, FE-BE 계약 변경, 검증한 테스트, 남은 위험.

## 9. 신규 게임 개발 완료 체크리스트

- [ ] 기존 게임 중 가장 유사한 엔진/규칙/화면을 선정하여 재사용 기준 작성
- [ ] 게임별 폴더에서 규칙/상태/엔진을 구현
- [ ] 동일 gameId 재호출, 중복 actionId, stale expectedVersion 처리
- [ ] 타임아웃, 기권, 이탈, 재접속, 관전자 경로 확인
- [ ] 공통 시작(예약 커밋 이후 엔진 생성) 및 종료 이벤트 사용
- [ ] 코인 직접 수정/별도 정산 코드 없음
- [ ] gameCode·인원·종료 사유 공통 검증과 DB CHECK 확인
- [ ] Flyway 버전 중복, 적용 locations, 기존 파일 변경 없음 확인
- [ ] 공통 수정 파일에 대한 다른 담당자 영향 공유
- [ ] 대상 게임 + 영향 범위 테스트 완료
- [ ] FE 통합 후 새 게임 시나리오 검증
