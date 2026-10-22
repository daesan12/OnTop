# USER-01 내 정보 조회 — S15P31B105-120

## 요청과 응답

`GET /api/v1/users/me`는 정상 회원의 Access JWT를 요구한다. 요청 본문과 userId 파라미터는 받지 않는다.
쿼리에 userId를 넣어도 조회 대상은 바뀌지 않는다.

```http
GET /api/v1/users/me
Authorization: Bearer <accessToken>
```

HTTP 200, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`:

```json
{
  "userId": 1,
  "nickname": "미지",
  "characterGender": "FEMALE"
}
```

User 엔티티의 id, nickname, characterGender만 명시적 record DTO로 반환한다.
온보딩 응답과 동일한 필드명이며 성별은 MALE/FEMALE다.
providerUserId, 로그인 sessionId, 인증 토큰, loginProvider는 반환하지 않는다.
createdAt/updatedAt/deletedAt은 엔티티에 있지만 이번 프로필 응답에는 포함하지 않는다.
프로필 이미지 필드는 현재 엔티티에 없으므로 추가하지 않는다.

## 인증 및 조회

기존 보호 SecurityFilterChain의 ROLE_MEMBER 정책을 그대로 적용한다.
기존 JWT 검증 → 활성 회원/로그인 세션 검증 → SecurityContext 설정을 거친 뒤
`@AuthenticationPrincipal AuthenticatedUser`의 내부 userId만 사용한다.
UserProfileService가 기존 UserRepository.findById의 읽기 전용 트랜잭션으로 DB를 조회하고,
인증 이후 삭제되거나 탈퇴한 경우도 다시 거절한다. 데이터 저장/갱신은 수행하지 않는다.
단일 조회이며 지연 로딩 관계나 엔티티 전체 직렬화를 사용하지 않는다.
요청 처리 중 조회 이후 발생하는 상태 변경까지 직렬화하는 잠금은 추가하지 않는다.

DB 없는 기본 프로필도 기동할 수 있도록 Repository를 지연 조회한다.
DB 프로필·유효한 인증 설정·활성 로그인 세션이 있어야 실제 프로필을 조회할 수 있다.
기존 OAuth/온보딩/Refresh/Logout/WebSocket 정책과 스키마는 변경하지 않는다.

## 오류

기존 `{code,message}` 및 RestSecurityErrorHandler를 재사용한다.

| 상태 | code | 조건 |
| --- | --- | --- |
| 401 | AUTH_AUTHENTICATION_REQUIRED | 인증 누락 |
| 401 | AUTH_INVALID_ACCESS_TOKEN | 잘못된 형식/서명/만료/토큰 용도 등 |
| 401 | AUTH_MEMBER_STATE_CHANGED | 회원 없음·탈퇴 또는 로그인 세션 무효 |
| 403 | AUTH_ACCESS_DENIED | 기존 ROLE_MEMBER 권한 정책 위반 |
| 503 | AUTH_MEMBER_LOOKUP_UNAVAILABLE | 회원 인증 또는 프로필 DB 조회 불가 |

오류는 no-store이며 401에 WWW-Authenticate: Bearer를 포함한다.
JWT 설정 오류 등 그 밖의 기존 Security 오류 계약도 유지한다.
DB 예외 원문이나 소셜 식별자를 응답/로그에 출력하지 않는다.

## Postman

1. local,db 및 기존 AUTH 환경변수로 실행한다. 실제 비밀값은 공유하지 않는다.
2. 기존 OAuth → exchange 또는 온보딩으로 받은 Access JWT를 Postman의 Bearer Token에 설정한다.
3. GET /api/v1/users/me → 200 및 본인 프로필 3개 필드를 확인한다.
4. ?userId=다른ID를 붙여도 동일한 본인이 조회되는지 확인한다.
5. 토큰 제거/위조/만료 시 401을 확인한다. 토큰을 콘솔·보고서에 복사하지 않는다.
6. 로그아웃한 로그인 세션의 Access JWT는 기존 113번 정책에 따라 401이다.
7. 탈퇴/DB 장애는 ontop_dev를 조작하지 않고 격리 자동화 테스트로 확인한다.

## 선택적 테스트

backend에서 실행한다. MySQL 테스트에는 기존 격리 TEST_DB_*를 별도로 주입한다.
ontop_dev URL은 MySQL 테스트의 이름/loopback 검증에서 거절한다.

```powershell
.\gradlew.bat test --tests '*UserProfileServiceTests' --tests '*UserProfileControllerTests' --tests '*UserProfileHttpTests' --tests '*RestSecurityTests' --tests '*RestWithoutDatabaseTests' --console=plain
.\gradlew.bat mysqlTest --tests '*UserProfileMySqlTests' --console=plain
git diff --check
```

이번 구현 단계에서는 전체 회귀 테스트를 실행하지 않는다. MR 직전에 전체 회귀를 진행한다.
Swagger/OpenAPI 도입은 User API 전체 완료 후 진행한다.

2026-10-22 선택 실행 결과: 신규 Controller 2개, Service 6개, 실제 HTTP 10개,
기존 RestSecurityTests 42개, RestWithoutDatabaseTests 1개, 격리 MySQL 2개가 통과했다.
총 63개 통과, 실패/오류/건너뜀 0개다. 실제 HTTP 테스트는 loopback 임의 포트의 서버를 사용하며
JWT/Security/Principal은 실제 구현, 회원 조회는 테스트 대역이다. MySQL 2개는 실제 Repository를 사용한다.
개발 DB의 users/refresh_tokens 집계 지문과 Flyway 이력은 테스트 전후 동일했다.
실제 소셜 로그인/배포 브라우저 수동 검증이나 전체 회귀 완료를 의미하지 않는다.
