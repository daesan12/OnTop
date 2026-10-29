# 로그인 세션 무효화와 WebSocket 종료 — S15P31B105-113

## 인증 계약

Access JWT에 `sid`를 추가합니다. Refresh의 `session_id`와 같은 정규 UUID 문자열이며, JSESSIONID와는 다릅니다.
로그인·온보딩은 새 로그인 계열을 만들고 Refresh Rotation은 같은 계열을 유지합니다.
sub는 계속 내부 userId입니다. Refresh 원문/해시·OAuth 토큰/식별자는 JWT에 넣지 않습니다.
기존 HS256·typ·token_use·issuer·audience·서명·iat/nbf/exp·최대30분·crit 검증은 유지합니다.

**sid가 없거나 잘못된 기존 JWT는 401입니다.** 사용자 ID로 세션을 추정하거나 레거시 예외를 허용하지 않습니다.
배포 전 발급한 Access는 폐기하고 기존 Refresh 쿠키로 `/api/v1/auth/refresh`를 한 번 호출해 새 Access를 받습니다.
유효한 Refresh도 없으면 OAuth 로그인을 다시 진행합니다. Refresh 쿠키·HTTP 응답 필드·온보딩 Bearer 정책은 같습니다.
전환 시 구버전 인증 인스턴스를 함께 노출하지 않습니다. 현재 구성은 단일 인스턴스입니다.

AccessJwtService의 verify/verifyAccess는 서명·클레임 검증만 담당합니다. 서비스 인증에 이것만 사용하면 안 됩니다.
`AccessAuthenticationService.authenticate(raw)`는 JWT와 현재 DB 회원/로그인 계열을 함께 확인합니다.
이미 검증된 내부 userId/sid를 재확인할 때만 `requireActive(userId, sessionId)`를 사용합니다.
Spring Security의 AuthenticatedUser와 WebSocket의 VerifiedWebSocketUser에는 둘 다 sessionId가 있으며
getName/기존 CONNECTED.userId는 여전히 내부 userId입니다. 두 Principal 타입은 합치지 않았습니다.

## DB와 동시성

새 테이블/마이그레이션은 없습니다. V1~V3와 refresh_tokens의 기존 (user_id, session_id) 인덱스를 사용합니다.

JpaActiveMemberLookup은 REQUIRES_NEW / READ_COMMITTED 읽기 전용 트랜잭션의 **단일 SELECT**에서 다음을 확인합니다.

- users.id 일치, deleted_at IS NULL
- 같은 user_id + session_id의 Refresh 행 존재
- revoked_at IS NULL, created_at <= 현재 시각, expires_at > 현재 시각

회전된 과거 행이 폐기되어도 현재 후속 행이 유효하면 기존 Access도 만료 전까지 사용할 수 있습니다.
로그아웃/기존5초 초과 재사용 판정으로 계열 전체를 폐기하면 Access도401입니다. 회원/세션 상태를 캐시하지 않습니다.
조회·트랜잭션 장애는 503(AUTH_MEMBER_LOOKUP_UNAVAILABLE)이며 잘못된 JWT로 분류하지 않습니다.
비활성/없는 회원 또는 로그인 계열은 기존 AUTH_MEMBER_STATE_CHANGED(401)로 처리합니다.

인증은 SELECT가 관찰한 커밋 상태를 기준으로 판정합니다. 로그아웃 커밋 후의 새로운 조회는 거절하지만,
커밋 전에 이미 인증된 진행 중 REST 요청을 소급 취소하지는 않습니다. 도메인별 장기 작업 취소/커밋 규칙은 별도입니다.
Refresh 폐기·신규 저장은 기존 트랜잭션 안에서 원자적으로 처리되어 회전 중 일시적인 빈 계열을 노출하지 않습니다.
기존 회원 → Refresh 잠금 순서, 5초 grace, 7일 슬라이딩 만료는 변경하지 않았습니다.

## 로그아웃과 연결 수명

1. 기존 Origin·Refresh 쿠키를 검증합니다. 본문·Access 헤더·JSESSIONID는 필요 없습니다.
2. REQUIRES_NEW 로그아웃 트랜잭션에서 같은 로그인 계열의 Refresh 전체를 폐기하고 알림을 발행합니다.
3. `@TransactionalEventListener(AFTER_COMMIT)`가 커밋 성공 이후에만 연결 종료를 처리합니다.
4. 현재 userId/sid에 해당하는 pending/연결된 소켓을 선점하여 이후 메시지 전달을 차단합니다.
5. 별도 가상 스레드에서 4401 `Login session ended`로 닫고 기존 Hub.disconnect로 정리합니다.
6. HTTP는 기존 204 + 삭제 쿠키입니다. 종료 I/O/정리 실패는 고정 메시지로만 기록하고 커밋된 로그아웃을 되돌리지 않습니다.

명시적 로그아웃의 내부 사유는 LOGOUT입니다. 5초 grace 이후 Refresh 재사용 탐지와 원인이 특정되지 않은 계열 폐기는
AUTH_SESSION_REVOKED로 구분합니다. Refresh 처리 중 확인한 비활성 회원의 단일 계열 폐기도 후자이며,
회원 전체 탈퇴 이벤트로 범위를 확대하지 않습니다. 정상 Rotation과 grace 중 거절은 폐기 이벤트를 발행하지 않습니다.
다른 로그인 계열/회원에는 영향을 주지 않습니다. 물리적인 close가 실패해도 서버 연결 정리를 계속 시도하며,
이미 폐기 선점한 소켓의 추가 메시지는 Hub에 전달하지 않습니다. DB의 폐기 상태는 재접속을 계속 차단합니다.

MemberWebSocketConnections는 WebSocket ID → (내부 userId, 로그인 sid, 소켓, 정리 콜백)을 메모리에서 추적합니다.
소켓/전송 종료 시 추적 정보를 제거합니다. Refresh 원문/해시를 소켓 속성에 보관하지 않습니다.
기존 회원당 중복 연결 정책이 있어 동일 회원의 여러 계열이 동시에 Hub 연결을 차지하지는 않습니다.

### AUTH 종료 원인과 소비자 계약

`AuthenticationRevocations.Revoked(userId, sessionId, reason)`의 reason은 서버 내부 enum입니다.

| 발행 경로 | reason | 범위 | ConnectionCloseReason | Close Code | 현재 게임 처리 |
| --- | --- | --- | --- | ---: | --- |
| AuthLogoutPersistenceService.logout | LOGOUT | userId + 로그인 sid | LOGOUT | 4401 | 연결된 참가자의 즉시 기권/탈락 요청 |
| AuthRefreshPersistenceService.rotate의 5초 초과 재사용 판정 | REFRESH_REUSE_DETECTED | userId + 로그인 sid | AUTH_SESSION_REVOKED | 4401 | 기존 30초 유예 |
| sessionRevoked(userId, sid) 및 비활성 회원 Refresh 방어 | SESSION_REVOKED | userId + 로그인 sid | AUTH_SESSION_REVOKED | 4401 | 기존 30초 유예 |
| MemberConnectionTermination.memberDeactivated | MEMBER_DEACTIVATED | 회원 전체, sessionId=null | MEMBER_DEACTIVATED | 4403 | 연결된 참가자의 즉시 기권/탈락 요청 |

원인 없는 기존 2인자 sessionRevoked 호출/Revoked 생성자는 단일 계열을 SESSION_REVOKED로 분류합니다.
기존 sessionId=null 생성자는 회원 전체 MEMBER_DEACTIVATED입니다. 명시적 원인 누락(null)이나 원인과 범위가
다른 조합은 거절합니다. SESSION_REVOKED를 LOGOUT으로 추정하지 않습니다.

MemberWebSocketConnections는 매핑을 한 번 계산하여 레지스트리의 종료 속성, 실제 close와 정리 콜백에
동일한 사유를 사용합니다. TableWebSocketHandler는 클라이언트가 보낸 CloseStatus의 코드/문자열을 인증 종료
사유로 해석하지 않습니다. HTTP 응답·쿠키·WebSocket Close Code와 클라이언트 메시지 계약은 변경하지 않습니다.

데이터 팀은 Revoked의 reason으로 명시적 로그아웃·보안 폐기·회원 탈퇴를 구분할 수 있습니다. 실제로 커밋된
행동만 수집하려면 `@TransactionalEventListener(phase = AFTER_COMMIT)`을 사용합니다. 이벤트는 트랜잭션 안에서
발행되므로 일반 `@EventListener`로 관찰했다는 이유만으로 커밋 성공을 기록하면 안 됩니다. 리스너의 별도 DB 기록은
독립 트랜잭션(REQUIRES_NEW 등)이 필요합니다. 이벤트 전체/toString이나 토큰을 로그에 출력하지 않습니다.
이벤트에는 eventId·발생 시각·영속 outbox가 없으며, 반복 로그아웃으로 중복 발행될 수 있습니다. 집계 시 sid만으로
모든 행동을 하나로 합치거나 exactly-once 전달을 가정하지 않습니다. 행동 로그 리스너 자체는 이번 범위가 아닙니다.

### 중복 이벤트·종료 원인 경합과 오프라인 유예

회원 행 → Refresh 행의 기존 잠금과 AFTER_COMMIT을 유지합니다. DB 롤백 시 소켓을 닫지 않습니다.
동일 소켓은 레지스트리에서 먼저 선점한 이벤트가 제거하므로 반복 알림은 다시 닫거나 사유를 덮지 않습니다.
이는 DB 커밋 순서와 비동기 리스너 실행 순서가 반드시 같다는 보장은 아닙니다.

- 재사용 감지가 먼저 연결을 선점하면 AUTH_SESSION_REVOKED/4401이며, 이후 로그아웃이 LOGOUT으로 승격하지 않습니다.
- 로그아웃이 먼저 선점하면 LOGOUT/4401이며, 이후 재사용 감지가 이를 덮지 않습니다.
- 탈퇴와 로그아웃도 공유 연결은 최초 선점 사유/코드를 유지합니다. 탈퇴는 남아 있는 같은 회원의 다른 sid 연결까지
  MEMBER_DEACTIVATED/4403으로 종료하고, DB에서는 회원 비활성화와 모든 계열 폐기가 유지됩니다.
- 네트워크 단절로 소켓이 이미 제거되어도 게임 복구 서비스가 보관한 로그인 sid에 커밋된 LOGOUT을 대조해
  같은 세션의 경기 참가자를 즉시 기권/탈락 처리합니다. MEMBER_DEACTIVATED는 해당 회원의 복구 상태에 적용합니다.
  소켓 ID와 로그인 sid는 별도로 보관하며 다른 sid의 로그아웃은 적용하지 않습니다. 인증 레지스트리가 이미
  AUTH_SESSION_REVOKED로 종료한 연결은 후속 로그아웃으로 승격하지 않고 기존 30초 유예를 유지합니다.

커밋 후 close는 비동기입니다. HTTP 204가 소켓 close 완료까지 기다리지는 않습니다. 종료 I/O 실패는 이미 커밋된
인증 결과를 롤백하지 않으며 서버 정리 콜백을 계속 시도합니다. 장애 복구·원인 우선순위 승격은 후속 설계입니다.

### 핸드셰이크·등록·폐기 경합

- 접속권은 검증된 userId와 sid를 함께 보관합니다. 소비 시 해당 로그인 계열을 DB에서 다시 확인합니다.
- 발급 후 로그아웃하면 미소비 접속권도 401입니다. 최대30초·일회 소비·Origin 결합은 그대로입니다.
- Upgrade 후 실제 연결을 등록할 때 pending 항목부터 보관하고 로그인 계열을 다시 조회합니다.
- 폐기가 먼저 끝났으면 DB 재검증이 거절합니다. pending 등록 뒤 폐기되면 알림이 이를 선점하여 Hub 등록을 막습니다.
- DB 조회 뒤 Hub 등록과 폐기가 경합하면 레지스트리의 짧은 등록 잠금으로 순서를 정합니다.
- DB 조회는 레지스트리 잠금 밖에서 수행합니다. DB 장애는 HTTP Upgrade 전503, Upgrade 후1013이며
  의도적인 로그아웃/기권으로 기록하지 않습니다. 기존 정상 연결은 DB 장애만으로 종료하지 않습니다.

Access JWT가 연결 중 만료되는 것만으로 소켓을 닫지 않습니다. 새 연결에는 유효한 Access로 발급한 새 접속권이 필요합니다.

## User 탈퇴 연동

후속 [USER-03 탈퇴 API](user-withdrawal.md)가 기존 인터페이스와 커밋 후 리스너를 연결했습니다.
`MemberConnectionTermination.memberDeactivated(userId)`는 User 탈퇴 트랜잭션 안에서 호출합니다.

USER-03은 다음을 같은 트랜잭션으로 처리합니다.

1. 기존 인증과 같은 순서로 회원 행 잠금 및 상태 재검증
2. deleted_at 기록
3. 그 회원의 모든 활성 Refresh 계열 폐기 (복구 후 과거 자격이 되살아나지 않도록 함)
4. MemberConnectionTermination.memberDeactivated 호출
5. 커밋

커밋 후 해당 회원의 전체 연결은 4403 `Member inactive` / MEMBER_DEACTIVATED로 정리합니다.
롤백은 연결을 유지합니다. 트랜잭션 없는 알림 호출은 실패하며 즉시 종료로 대체하지 않습니다.
탈퇴 API·전체 계열 DB 폐기·복구 시 과거 자격 유지 차단은 USER-03에서 검증합니다.
회원 deleted_at이 이미 기록된 상태의 신규 인증은 별도 이벤트 유무와 무관하게 DB 조회에서 차단합니다.

## 게임 영역 경계

TableHub·GameReconnectService·게임 엔진·기권·베팅·정산 코드는 변경하지 않았습니다.
기존 Hub.disconnect(webSocketId, reason)는 LOGOUT/MEMBER_DEACTIVATED를 GameDepartureReason으로 전달하고,
나머지는 DISCONNECT_TIMEOUT으로 전달합니다. GameReconnectService의 기존 경로가 연결된 참가자의 명시적
로그아웃/탈퇴를 30초 대기 없이 FORFEIT/ELIMINATE 요청으로 처리합니다. AUTH_SESSION_REVOKED는 즉시 이탈로
취급하지 않습니다. 현재 GameReconnectService는 local 프로필 Bean이며 운영 프로필 전환은 이번 범위가 아닙니다.
기존 GameRecoveryGateway.graceExpired와 공통 경기 종료/중도 탈락 이벤트를 재사용하며 직접 호출하는 우회는 없습니다.
최종 베팅·정산 구현을 보완한 것은 아닙니다. 오프라인 유예·최초 사유 경합의 제한은 위와 같습니다.
서버/DB 장애를 의도적인 기권으로 해석하지 않으며 기존 네트워크 복귀·중복 연결·턴 정책도 유지합니다.

## Postman·브라우저 수동 검증

실제 토큰/쿠키/코드/소셜 식별자/로그인 sid는 콘솔·공유 환경·보고서·스크린샷에 남기지 않습니다.

1. local,db로 실행하고 실제 OAuth → exchange 또는 온보딩으로 로그인 A를 준비합니다.
2. Access로 보호 REST를 조회하고 `/api/v1/auth/websocket-ticket`으로 접속권을 두 개 받습니다.
3. 하나로 `/ws/tables?ticket=...`에 연결하고 다른 하나는 소비하지 않습니다. Origin 조건은 기존 문서를 따릅니다.
4. 허용 Origin + A의 Refresh 쿠키로 POST `/api/v1/auth/logout` → 204, 삭제 쿠키, 소켓4401을 확인합니다.
5. A의 기존 Access로 보호 REST/접속권 발급은401, 보관한 접속권 연결도401이어야 합니다.
6. 별도 쿠키 jar의 로그인 B는 A 로그아웃 뒤에도 REST/Refresh를 사용할 수 있어야 합니다.
   회원당 소켓 하나 정책은 유지하므로 B 소켓을 먼저 연 경우 A의 로그아웃이 B 소켓을 닫지 않는지 확인합니다.
7. Rotation 전후 JWT의 sid가 같은지 로컬에서만 확인합니다. 정상 Rotation은 이전 Access를 즉시 폐기하지 않습니다.
8. 롤백/DB 장애/회원 비활성화는 ontop_dev를 조작하지 않고 격리 자동화 fixture로 검증합니다.

프론트는 204/4401/4403에서 Access와 회원 상태를 지우고 자동 재접속을 멈춰야 합니다.
1013/HTTP503은 일시적 인증 조회 장애로 구분하며 의도적인 로그아웃이나 기권으로 해석하지 않습니다.
로그아웃 이전 Refresh 응답이 늦게 도착해도 Access를 다시 저장하지 않도록 기존 요청 세대 관리가 필요합니다.
Origin/CORS·Cookie 설정·HTTPS/WSS·접속권 query 로그 제외 정책은 기존 문서를 유지합니다.

## 검증과 운영 제한

113번 최초 검증에서는 기존 별도 MySQL 테스트 컨테이너/DB만 재사용했습니다.
후속 종료 원인 변경의 격리 DB와 선택 실행 결과는 아래 별도 기록을 따릅니다.
TEST_DB_*와 TEST_SHOP_DB_*는 분리하고 ontop_dev를 테스트에 사용하지 않습니다.

```powershell
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

2026-10-22 최종 실행은 BUILD SUCCESSFUL (5분13초)입니다.

| 태스크 | 통과 | 실패/오류/건너뜀 |
| --- | ---: | ---: |
| test | 1,012 | 0 |
| flowTest | 43 | 0 |
| mysqlTest | 132 | 0 |

flowTest는 일부 기본 테스트를 다시 실행하므로 서로 다른 사례 수로 합산하지 않습니다.
신규 검증은 연결 레지스트리7개·폐기 알림3개·JWT sid 누락/형식 오류2개·격리 MySQL11개, 총23개입니다.
기존 로그인/온보딩/Refresh 테스트에도 sid 일치 검증을 보완했습니다.
git diff --check 통과, 기존 V1~V3/Flyway 재실행/JPA validate 회귀 통과입니다.
ontop_dev의 users/refresh_tokens 행 수·집계 지문과 Flyway 이력을 읽기 전용으로 비교해 작업 전후 일치를 확인했습니다.
이전 준비된 상점 테스트 DB만 관리자 자격으로 사용하며 애플리케이션 권한·MySQL 전역 설정을 바꾸지 않습니다.
실제 공급자 로그인/배포 브라우저 검증을 수행했다는 뜻은 아닙니다.
연결 추적/커밋 후 이벤트는 단일 인스턴스 전제입니다. 다중 서버에서는 전체 인스턴스에 폐기 알림을 전파해야 합니다.
종료 실패 운영 경보/재시도와 장시간 처리 중 REST 요청 취소도 후속 설계 대상입니다.

## 종료 원인 변경 검증 · 2026-10-23

작업 브랜치: feat/S15P31B105-2-session-termination-reasons, 기준 커밋: 8f7e4ed.
작업 중 원격 dev에 추가된 2개 커밋(최신 2cfd3fb)은 GameReconnectTests의 재시도 검증만 변경했습니다.
현재 브랜치에 merge/rebase하지 않았으며 아래 결과는 작업 브랜치 소스 기준입니다.

관련 테스트만 선택 실행했으며 전체 clean build/flowTest/mysqlTest 회귀는 MR 직전에 수행합니다.

```powershell
# backend/, Java 21. MySQL 실행 전 TEST_DB_*는 아래 전용 DB 자격으로 비밀값 출력 없이 주입
.\gradlew.bat test --tests '*AuthenticationRevocationsTests' --tests '*AuthLogoutPersistenceServiceTests' --tests '*AuthRefreshPersistenceServiceTests' --tests '*MemberWebSocketConnectionsTests' --tests '*GameDepartureFlowTests' --tests '*GameLifecycleTests' --console=plain
.\gradlew.bat mysqlTest --tests '*SessionInvalidationMySqlTests' --tests '*UserWithdrawalMySqlTests' --console=plain
git diff --check
```

| 클래스 | 통과 | 실패/오류/건너뜀 |
| --- | ---: | ---: |
| AuthenticationRevocationsTests | 8 | 0 |
| AuthLogoutPersistenceServiceTests | 8 | 0 |
| AuthRefreshPersistenceServiceTests | 12 | 0 |
| MemberWebSocketConnectionsTests | 19 | 0 |
| GameDepartureFlowTests | 9 | 0 |
| GameLifecycleTests | 10 | 0 |
| SessionInvalidationMySqlTests | 14 | 0 |
| UserWithdrawalMySqlTests | 15 | 0 |
| 합계 (재실행 중복 제외) | 95 | 0 |

MySQL 두 클래스는 실제 랜덤 포트 HTTP·WebSocket을 사용합니다. 로그아웃/재사용 경합 3회는
AUTH_SESSION_REVOKED가 먼저 선점한 경우 2회, LOGOUT이 먼저 선점한 경우 1회였습니다. 모두 logout=204,
reuse=401, close=4401이며 다른 sid는 REST/Refresh 200입니다. 탈퇴/로그아웃 경합은 별도 sid로 탈퇴를 인증했고,
3회 모두 양쪽 HTTP204·최초 LOGOUT/4401·회원 전계열 폐기·다른 회원 유지였습니다. 단위 테스트는 반대 선점 순서와
MEMBER_DEACTIVATED/4403도 검증합니다. 이 횟수는 해당 실행 관찰값이며 스케줄링 순서를 보장하지 않습니다.

접속권 응답~CONNECTED 45ms, 미사용 접속권의 로그아웃 후 거절 시 나이 107ms였습니다. 제어 시계도 진행하지 않아
30초 만료와 계열 폐기로 인한 401을 구분했습니다. 정상 Rotation/5초 grace의 연결 유지, 롤백/DB 장애,
close I/O 실패, 중복 이벤트, 클라이언트 CloseStatus 사유 위조 차단, 게임 즉시 이탈/기존 30초 유예를 함께 확인했습니다.

기존 테스트 컨테이너 ontop-auth61-test-20261021-073629-ac72f0(MySQL 8.4.11, 127.0.0.1:49701)에
새 DB ontop_users80_test_auth_reasons_20261023_135048_29fd50 하나와 그 DB 전용 사용자를 준비했습니다.
기존 DB/컨테이너/볼륨은 수정·초기화·삭제하지 않았고 ontop_dev에 쓰기 작업을 하지 않았습니다.
테스트 fixture만 새 DB에 남습니다. 자격은 Git 제외 .gradle/auth-termination-verification에 Windows DPAPI로 보관하고
원문은 출력하지 않았습니다. 테스트 DB/사용자는 자동 삭제하지 않으며 후속 정리는 사용자 확인 후 수행합니다.
기존 Flyway V1~V4 적용·재검증과 JPA validate가 통과했으며 마이그레이션 파일/스키마 정의 변경은 없습니다.
