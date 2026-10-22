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

일반 네트워크 단절과 구분되는 내부 사유는 AUTH_SESSION_REVOKED입니다. 5초 grace 이후 Refresh 재사용 탐지나
Refresh 처리 중 확인한 비활성 회원의 계열 폐기도 같은 커밋 후 종료 경로를 사용합니다. grace 중 거절은 연결을 닫지 않습니다.
다른 로그인 계열/회원에는 영향을 주지 않습니다. 물리적인 close가 실패해도 서버 연결 정리를 계속 시도하며,
이미 폐기 선점한 소켓의 추가 메시지는 Hub에 전달하지 않습니다. DB의 폐기 상태는 재접속을 계속 차단합니다.

MemberWebSocketConnections는 WebSocket ID → (내부 userId, 로그인 sid, 소켓, 정리 콜백)을 메모리에서 추적합니다.
소켓/전송 종료 시 추적 정보를 제거합니다. Refresh 원문/해시를 소켓 속성에 보관하지 않습니다.
기존 회원당 중복 연결 정책이 있어 동일 회원의 여러 계열이 동시에 Hub 연결을 차지하지는 않습니다.

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
기존 Hub.disconnect(webSocketId, reason)를 사용합니다. 종료 사유는 메트릭에서 구분됩니다.
기존 GameRecoveryGateway.graceExpired(GraceExpiration)와 FORFEIT/ELIMINATE 명령은 확인했습니다.
이 경로는 eventId·경기·참가자·단절 시각·유예 마감에 따른 처리 계약이므로 즉시 로그아웃 명령으로 임의 호출하지 않습니다.
현재 Hub는 사유를 경기 복귀 서비스에 전달하지 않고 disconnected(userId, webSocketId)를 호출합니다.
따라서 인증 종료도 진행 중 경기에서는 기존 **30초 유예**가 시작될 수 있습니다.
즉시 기권·최종 정산 완료를 의미하지 않습니다. 인증 종료 사유를 경기 담당 계약에 연결하는 작업은 후속 합의가 필요합니다.
후속 즉시 기권은 실제 종료한 연결/참가 상태를 확인해야 하며, 다른 로그인 계열의 경기를 userId만으로 제재하면 안 됩니다.
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

기존 별도 MySQL 테스트 컨테이너/DB만 재사용하며 새 Docker/DB 리소스를 만들지 않습니다.
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
