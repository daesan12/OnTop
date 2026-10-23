# USER-03 회원 탈퇴 — S15P31B105-122

## API

`DELETE /api/v1/users/me`

Authorization: Bearer <accessToken>이 필요하다. 요청 본문/회원 ID 파라미터는 사용하지 않는다.
수정 대상은 @AuthenticationPrincipal AuthenticatedUser.userId다.
기존 ROLE_MEMBER/JWT/sid/활성 회원 검증을 그대로 사용한다.
온보딩 토큰, Refresh 쿠키, JSESSIONID로 탈퇴할 수 없다.

성공은 HTTP 204, 본문 없음, Cache-Control: no-store, Referrer-Policy: no-referrer다.
실제 계정 데이터/소셜 식별자/토큰을 반환하거나 로그에 기록하지 않는다.
탈퇴 이후 같은 JWT로 재요청하면 기존 인증 정책에 따라 401이다. 로그아웃의 멱등 204와는 다른 계약이다.
이 API는 Refresh 쿠키를 인증에 사용하거나 변경하지 않는다.
브라우저에 남은 Refresh 쿠키도 서버의 해시 폐기 상태 검사로 사용할 수 없다.
프론트는 204/4403 후 메모리의 Access와 회원 상태를 지우고 자동 재접속을 중단한다.

## 하나의 DB 트랜잭션

UserWithdrawalService는 db 프로필의 UserWithdrawalPersistenceService를 ObjectProvider로 조회한다.
DB 없는 기본 프로필도 시작할 수 있으며, 실제 탈퇴에 DB가 없으면 안전하게 503으로 실패한다.
별도 Bean의 REQUIRES_NEW 트랜잭션을 호출하고 커밋이 완료된 뒤에만 204를 반환한다.

1. 기존 findForAuthenticationById로 회원 행 잠금. Refresh Rotation/Logout/인증 교환과 같은 잠금 순서다.
2. 잠금 시점의 회원 존재/활성 상태 재확인. 없거나 deleted_at이 있으면 401.
3. 신뢰된 oauthClock으로 deleted_at 기록. TIMESTAMP(3)에 맞춰 밀리초로 절삭한다.
4. revokeAllForUser로 해당 회원의 revoked_at=NULL인 모든 Refresh 행을 폐기한다.
   모든 session_id와 만료/회전 이력을 포함하며, 이미 폐기된 행의 시각은 보존한다.
   기존 @Modifying의 flushAutomatically/clearAutomatically 패턴을 재사용한다.
   deleted_at flush와 Refresh 벌크 갱신은 같은 트랜잭션이므로 함께 커밋/롤백된다.
5. MemberConnectionTermination.memberDeactivated(userId)를 트랜잭션 안에서 호출한다.
6. DB 커밋 후 기존 AuthenticationRevocations/MemberWebSocketConnections 리스너가 종료를 수행한다.

신규 폐기 이벤트/소켓 종료 관리자/전역 인증 필터를 추가하지 않는다.
물리 DELETE, 소셜 식별자 해제, 닉네임 초기화, 연쇄 삭제는 하지 않는다.
기존 @PreUpdate의 updated_at 관리 외 다른 회원 필드는 바꾸지 않는다.

## 인증과 WebSocket

기존 AccessAuthenticationService는 회원 활성 상태와 sid의 활성 Refresh 존재를 매 요청 확인한다.
따라서 탈퇴 후 모든 기존 Access는 USER-01/02/04·보호 REST·접속권 발급에서 401이다.
기존 Refresh도 전 계열 폐기로 재발급할 수 없고, 미사용 접속권도 소비 시 DB 상태 검사에서 거절된다.
USER-04의 독립 온보딩 토큰 인증 범위는 변경하지 않는다.

이미 등록된 해당 회원의 모든 연결은 AFTER_COMMIT에 4403 Member inactive/MEMBER_DEACTIVATED로 종료한다.
다른 회원은 영향이 없다. 롤백은 종료 알림을 실행하지 않으므로 기존 연결과 인증이 유지된다.
소켓 I/O 실패는 기존 리스너가 고정 문구로 처리/정리하며, 커밋된 탈퇴나 HTTP 204를 되돌리지 않는다.
단일 인스턴스 전제다. 다중 서버 폐기 알림 전파와 물리 연결 종료 실패 재시도는 기존 후속 설계 사항이다.

### 경합

- Refresh가 회원 잠금을 먼저 얻으면 회전 커밋 후 탈퇴가 신규 토큰까지 모두 폐기한다.
- 탈퇴가 먼저 얻으면 Refresh가 deleted_at을 확인해 401이다.
- Refresh 응답이 200으로 늦게 도착해도 발급된 JWT/Refresh는 탈퇴 커밋 후 사용할 수 없다.
- 접속권 소비/연결 등록과 탈퇴 경합은 기존 113번의 pending 등록/DB 재검증/커밋 이벤트로 보호한다.
  Upgrade 전 거절은 HTTP 401이다. Upgrade 뒤 Hub 등록 전에 비활성을 확인하는 경계에서는
  기존 일반 인증 종료 4401, 이미 추적된 연결의 회원 종료는 4403일 수 있으며 폐기된 연결을 유지하지 않는다.
- 접속권 30초/일회성/Origin 결합 정책과 기존 중복 연결 정책은 변경하지 않는다.
- 검증을 이미 통과해 처리 중인 REST 요청의 즉시 취소는 기존 인증 계층의 범위 밖이다.

## 복구·재가입: 기존 확정 구현을 유지

AuthUserStateService/restoreWithinRecoveryPeriod와 AUTH-02 문서의 실제 정책은 다음과 같다.

| 기간 | 기존 처리 |
| --- | --- |
| 탈퇴 후 정확히 7일 이내 | 같은 소셜 계정 로그인에서 deleted_at=NULL로 복구, 동일 userId/닉네임/연관 데이터 보존 |
| 7일 초과 | HTTP 409 AUTH_REJOIN_PENDING, 기존 행/데이터 보존, 교환 코드 없음 |

**현재 7일 초과는 신규 가입이 아니다.** 기존 (login_provider,provider_user_id) UNIQUE가 남아 있어
임의로 새 users 행을 생성하면 충돌한다. 영구 삭제/소셜키 해제/새 행 재가입 정책은 이번에 구현하지 않는다.
닉네임 UNIQUE도 그대로여서 탈퇴 회원의 닉네임은 행이 남는 동안 다른 회원이 사용할 수 없다.
계정 병합/공급자 연동을 도입하지 않는다.
7일 이내 복구 시 새 OAuth 인증/교환으로 새로운 로그인 계열을 발급해야 한다.
탈퇴 시 과거 전 계열을 폐기하므로 복구 후에도 기존 JWT/Refresh는 다시 살아나지 않는다.
확정할 후속 정책: 7일 경과 데이터 보존 기간/영구 삭제, 소셜키와 닉네임 해제 시점, 재가입 방식.

## 게임·지갑·FK 경계

- 기본 V2의 refresh_tokens.user_id → users.id FK는 ON DELETE/UPDATE RESTRICT다.
- 2026-10-22 개발 ontop_dev 메타데이터의 읽기 전용 확인 결과도 users/refresh_tokens/Flyway 이력만 존재하고,
  users 참조 FK는 refresh_tokens의 RESTRICT/RESTRICT였다. 개발 스키마를 확장하거나 초기화하지 않았다.
- 선택적 db/shop/V100은 user_items와 shop_purchases에서 users를 FK로 참조하며 명시적 cascade가 없다.
- Wallet 후속 작업의 기본 V4는 wallets→users 및 원장→wallets NO ACTION FK로 부모 행 삭제를 차단한다.
  경기/미니게임/items 참조는 선택적/미구현 스키마이므로 FK가 없다. 과거 V99/V101은 보존하고 신규 검증에서 제외한다.
  탈퇴·복구는 [공통 Wallet](wallet-initialization.md)을 재초기화하거나 보너스를 중복 지급하지 않는다.
- 사용자를 물리 삭제하지 않으므로 기존 ID 기반 FK를 유지한다. 지갑 잔액/예약액/원장/아이템/구매 기록은 수정하지 않는다.
- 현재 저장소의 기본 마이그레이션에 실제 게임/참가자 기록 테이블 생성은 없다. 게임 기록 삭제/정산을 추가하지 않는다.
- TableHub/게임 엔진/기권/베팅/정산 코드는 변경하지 않는다. 기존 Hub는 인증 종료에서도
  reconnect.disconnected를 호출해 진행 중 게임에 30초 재접속 유예가 시작될 수 있다.
  즉시 기권/정산/예약 코인 해제는 구현하지 않았으며 게임/지갑 담당자와 후속 정책 합의가 필요하다.

## 오류

기존 {code,message}와 RestSecurityErrorHandler/UserProfileExceptionHandler를 재사용한다.

| 상태 | code | 조건 |
| --- | --- | --- |
| 401 | AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN | 인증 없음/위조/만료/다른 용도 |
| 401 | AUTH_MEMBER_STATE_CHANGED | 회원 없음/탈퇴/무효 sid |
| 403 | 기존 AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED | Origin 또는 권한 정책 위반 |
| 503 | AUTH_MEMBER_LOOKUP_UNAVAILABLE | 인증 단계 DB 조회 장애 |
| 503 | USER_WITHDRAWAL_UNAVAILABLE | 탈퇴 조회/갱신/커밋 장애 또는 db 프로필 없음 |

DB 예외 원문을 응답/로그에 노출하지 않는다. 커밋 후 응답 전송 실패나 결과 불명확 시 프론트는
기존 자격으로 보호 API 접근 여부를 확인하고 재인증 안내를 해야 하며, 자동 복구/재가입을 실행하지 않는다.

## Postman/브라우저

운영 계정이나 ontop_dev를 자동 시험하지 않는다. 아래 수동 작업은 사용자가 준비한 검증 계정으로 진행한다.

1. 다른 쿠키 jar로 동일 계정의 로그인 A/B와 다른 회원 C를 준비한다. 토큰/소셜 식별자는 출력하지 않는다.
2. A의 JWT로 프로필 200 → 접속권 발급 → /ws/tables 연결/CONNECTED 확인, 별도 접속권 하나 보관.
   회원당 중복 연결 정책을 유지하므로 A/B 소켓을 동시에 열지 않는다. C 소켓은 별도로 열 수 있다.
3. A JWT로 DELETE /api/v1/users/me → 204/본문 없음/기존 소켓4403 확인.
4. A/B의 JWT로 USER-01/02/04·접속권 발급은 401, A/B Refresh도 401, 미사용 접속권 연결도 401 확인.
   접속권 검증은 30초 이내 즉시 실행해 만료와 계정 폐기를 구분한다.
5. C의 REST/Refresh/소켓은 유지되는지 확인한다.
6. 7일 이내 다시 실제 소셜 로그인하면 기존 ID 복구 후 새 자격으로만 이용할 수 있다.
7. 롤백/DB 장애/7일 초과/경합/참조 데이터 보존은 격리 자동화 fixture로 검증한다.

Swagger/OpenAPI·복구 API·삭제 배치·게임 즉시 기권/정산은 구현하지 않는다.

## 자동화 검증

backend에서 실행한다. TEST_DB_*는 기존 격리 인증 DB,
TEST_SHOP_DB_*는 기존 격리 상점 DB에만 주입한다. 테스트 클래스에서 loopback/DB 접두사를 검증한다.

```powershell
.\gradlew.bat test --tests '*UserWithdrawal*Tests' --tests '*UserProfile*Tests' --tests '*UserNickname*Tests' --tests '*Nickname*Tests' --tests '*UserOnboardingControllerTests' --tests '*RestSecurityTests' --tests '*RestWithoutDatabaseTests' --tests '*MemberWebSocketConnectionsTests' --tests '*AuthenticationRevocationsTests' --tests '*AuthUserStateServiceTests' --console=plain
.\gradlew.bat mysqlTest --tests '*UserWithdrawal*MySqlTests' --tests '*SessionInvalidationMySqlTests' --tests '*AuthRefreshMySqlTests' --tests '*AuthUserStateMySqlTests' --console=plain
# 구현 완료 후 MR 직전 1회
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

선택 실행: 일반 238개/격리 MySQL 48개 통과, 실패·오류·건너뜀 0개.
신규 테스트는 일반 17개(서비스 9/실제 HTTP 8), MySQL 13개(실제 HTTP·WebSocket 12/참조 데이터 1)다.
일반 HTTP는 실제 loopback 서버/JWT/Security/Principal을 사용하고 DB 경계만 대역이다.
MySQL 12개는 실제 회원/Refresh/이벤트/HTTP/Raw WebSocket을 사용하며 clock만 제어한다.
I/O 실패 사례의 물리 소켓만 close 예외를 발생시키는 대역이며 기존 실제 인증/커밋 이벤트를 거친다.
Rotation/탈퇴 및 핸드셰이크/탈퇴 경합은 각 3회 검증한다.
미사용 접속권은 변경하지 않은 30초 TTL 이내, clock 미진행 상태에서 401을 확인한다.
전체 회원 다중 sid 연결 선택은 기존 MemberWebSocketConnectionsTests를 재사용한다.
실제 Hub는 회원당 연결 하나만 허용하므로 이를 우회해 같은 회원의 실제 소켓 둘을 만들지 않는다.
다른 회원의 실제 소켓을 함께 열어 탈퇴 후 정상 메시징/REST/Refresh 유지를 확인한다.
7일 이내 복구 후 과거 Access의 서명/만료는 유효한 상태에서 REST 401을 확인해 과거 sid 부활을 방지한다.
참조 데이터 시험은 기존 shop-fixture DB에서 본 시험 회원/참조 행만 생성하고 삭제하지 않는다.

2026-10-22 MR 전 전체 회귀를 1회 실행했고 BUILD SUCCESSFUL(5분32초)로 완료했다.

| 태스크 | 통과 | 실패/오류/건너뜀 |
| --- | ---: | ---: |
| test | 1,140 | 0 |
| flowTest | 43 | 0 |
| mysqlTest | 161 | 0 |

flowTest는 일부 기본 사례를 다시 실행하므로 서로 다른 사례 수로 합산하지 않는다.
git diff --check와 기존 V1~V3/Flyway 재실행/JPA validate 회귀도 통과했다.
개발 ontop_dev의 users/refresh_tokens 집계 지문과 Flyway 이력은 작업 전후 동일했다.
기존 격리 DB/컨테이너만 재사용했으며 새 DB/볼륨/컨테이너를 만들거나 삭제하지 않았다.
개발 DB/볼륨 초기화는 하지 않았다. 격리 DB의 DML은 기존 테스트 fixture 준비/정리 정책을 따른다.
실제 공급자 로그인/배포 브라우저 수동 검증을 했다는 의미는 아니다.
