# USER-02 닉네임 수정 — S15P31B105-121

## API와 보안

`PATCH /api/v1/users/me`

Authorization: Bearer <accessToken>과 application/json 요청을 사용한다.

```json
{
  "nickname": "온탑고수"
}
```

HTTP 200, 기존 USER-01 UserProfileResponse:

```json
{
  "userId": 1,
  "nickname": "온탑고수",
  "characterGender": "FEMALE"
}
```

기존 ROLE_MEMBER 보호 체인이 JWT 서명·용도·만료·활성 회원·로그인 sid를 검증한다.
Security 설정이나 AUTH/JWT/Refresh/WebSocket 내부 로직은 변경하지 않는다.
@AuthenticationPrincipal AuthenticatedUser.userId만 수정 대상으로 사용한다.
회원 ID 쿼리는 사용하지 않으며 JSON의 userId/characterGender 등 추가 필드는 400으로 거절한다.
온보딩 토큰, Refresh 쿠키, JSESSIONID는 이 API의 인증 수단이 아니다.
기존 REST CORS/Origin 정책을 유지한다. 쿠키 인증을 도입하지 않는다.
성공/오류에 Cache-Control: no-store와 Referrer-Policy: no-referrer를 적용한다.
401에는 기존 WWW-Authenticate: Bearer를 포함한다.

## 공통 닉네임 정책

UserNicknameUpdateRequest와 User.changeNickname은 기존 NicknameValidator를 재사용한다.
한글 완성형/영문/숫자 2~8자만 허용하며 trim/소문자 변환 등 보정을 하지 않는다.
운영진 사칭 방지를 위해 대소문자와 관계없이 `GM`으로 시작하는 닉네임은 거절한다.
`게임GM`, `온탑GM`처럼 `GM`이 맨 앞에 없는 닉네임은 허용한다.
욕설·비속어 금칙어가 포함되면 `USER_INAPPROPRIATE_NICKNAME`(400)이다. 목록·매칭 규칙은
[닉네임 사용 가능 여부](nickname-availability.md#욕설비속어-금칙어)와 같다. 이미 저장된 닉네임은 다시 검증하지 않는다.
중복 판정은 USER-04와 동일한 existsByNicknameAndIdNot과 기존 nickname collation
utf8mb4_0900_as_ci를 사용한다. 다른 회원과 탈퇴 회원의 닉네임도 중복이다.
자신의 ID만 제외하므로 현재 닉네임과 대소문자 변형은 허용한다.

- 현재 값과 정확히 같은 문자열: 200, 갱신하지 않으므로 updated_at도 유지한다.
- 대소문자만 다른 문자열: 200, 요청한 표기를 그대로 저장한다.
- 다른 닉네임: 최종 중복 검증 후 변경한다.

닉네임만 도메인 메서드로 변경한다. 실제 변경 시 기존 @PreUpdate가 updated_at을 갱신한다.
소셜 계정 키/성별/created_at/deleted_at/Refresh 데이터는 변경하지 않는다.
스키마와 Flyway V1~V3는 변경하지 않는다.

## 트랜잭션과 경합

UserNicknameUpdateService는 DB 없는 기본 실행을 유지하기 위해 db 프로필의
UserNicknamePersistenceService를 ObjectProvider로 조회한다.
별도 Bean의 REQUIRES_NEW 쓰기 트랜잭션에서 다음 작업을 수행한다.

1. 기존 findForAuthenticationById로 회원 행을 잠근다. 회원 → Refresh 잠금 순서와 호환되며 Refresh는 잠그지 않는다.
2. 잠금 시점에 회원 없음/탈퇴를 다시 확인한다.
3. 사전 조회 결과와 관계없이 다른 회원 닉네임 중복을 최종 확인한다.
4. 닉네임 변경, flush, 트랜잭션 커밋을 수행한다.
5. 프록시 커밋이 끝난 후 실제 반영된 값의 프로필 DTO를 반환한다.

다른 회원이 같은 닉네임을 동시에 선점하면 DB UNIQUE가 최종 판정한다.
DataIntegrityViolationException은 실패한 트랜잭션 밖의 새 읽기 트랜잭션에서
동일 nickname의 다른 회원 존재 여부를 재확인한다. 확인되면 기존 409 오류로 변환한다.
SQL 예외 원문/제약 이름은 파싱하거나 노출하지 않는다.
다른 무결성 오류, 재조회 실패, DB/커밋 장애 또는 중복을 확인할 수 없는 경우는 503이다.
실패 트랜잭션 안에서 조회를 이어가거나 자동 재시도하지 않는다.

같은 회원의 동시 수정은 회원 행 잠금으로 순차 처리한다. 최종 닉네임은 마지막으로 커밋한 요청의 값이다.
GET 사전 확인은 예약이 아니다. 조회 후 선점되면 실제 PATCH/온보딩에서 409가 발생할 수 있다.
USER-05의 최종 중복 검증·UNIQUE·409 토큰 재시도 정책은 그대로 유지한다.

커밋 결과가 불명확하거나 커밋 후 응답 전송이 끊긴 경우 클라이언트는 GET /users/me로 현재 값을 확인한다.
이미 인증을 통과해 처리 중인 REST 요청의 로그아웃 즉시 취소는 기존 인증 계층의 범위에 포함되지 않는다.
새 요청의 로그아웃한 sid 차단과 잠금 시점의 회원 탈퇴 재확인은 유지한다.

## 오류 계약

기존 {code,message}와 UserProfileExceptionHandler/RestSecurityErrorHandler를 재사용한다.

| 상태 | code | 조건 |
| --- | --- | --- |
| 400 | USER_INVALID_NICKNAME_UPDATE_REQUEST | 본문 없음/잘못된 JSON/문자열 아님/필드 누락·추가 |
| 400 | USER_INVALID_NICKNAME | 닉네임 형식 오류 |
| 400 | USER_RESERVED_NICKNAME | 대소문자와 관계없이 GM으로 시작하는 예약 닉네임 |
| 400 | USER_INAPPROPRIATE_NICKNAME | 욕설·비속어 금칙어 포함 |
| 401 | AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN | 인증 없음/위조/만료/다른 용도 |
| 401 | AUTH_MEMBER_STATE_CHANGED | 없는 회원/탈퇴/로그인 계열 무효 |
| 403 | 기존 AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED | Origin 또는 권한 정책 위반 |
| 409 | USER_NICKNAME_ALREADY_EXISTS | 다른 회원/탈퇴 회원 중복 또는 확인된 UNIQUE 경합 |
| 503 | AUTH_MEMBER_LOOKUP_UNAVAILABLE | 기존 인증 단계 DB 조회 장애 |
| 503 | USER_PROFILE_UPDATE_UNAVAILABLE | 수정/커밋/충돌 재조회 장애, db 프로필 없음 |

토큰/소셜 식별자/DB 예외 원문을 응답이나 로그에 출력하지 않는다.

## Postman

1. 기존 local,db 환경에서 정상 로그인한 Access JWT를 Bearer Token에 설정한다.
2. PATCH /api/v1/users/me에 nickname 하나만 JSON으로 전달한다. 200과 본인 ID/닉네임/성별을 확인한다.
3. GET /api/v1/users/me에서 변경값을 확인한다.
4. USER-04에서 본인의 새 닉네임은 true, 다른 회원/온보딩 토큰으로 같은 닉네임을 조회하면 false다.
5. 같은 문자열은 200, 대소문자만 바꿔도 200이며 요청한 표기가 저장된다.
6. 다른 회원의 닉네임은 409, 형식 오류/추가 필드는 400이다. `GM`, `gm123`은
   `USER_RESERVED_NICKNAME`으로 400이다.
7. 인증 없음/온보딩 토큰/만료/로그아웃한 Access는 401이다.
8. 탈퇴/DB 장애/동시 경합은 ontop_dev를 조작하지 않고 격리 자동화 fixture로 검증한다.

USER 탈퇴 API/성별 수정/Swagger/OpenAPI는 구현하지 않는다.

## 자동화 검증

backend에서 실행한다. TEST_DB_*는 기존 loopback/ontop_users80_test_* 검증 DB,
TEST_SHOP_DB_*는 기존 별도 ontop_shop_test_* DB에만 주입한다.

```powershell
.\gradlew.bat test --tests '*UserNickname*Tests' --tests '*UserProfile*Tests' --tests '*Nickname*Tests' --tests '*UserOnboardingControllerTests' --tests '*RestSecurityTests' --tests '*RestWithoutDatabaseTests' --console=plain
.\gradlew.bat mysqlTest --tests '*UserNicknameUpdateMySqlTests' --tests '*UserProfileMySqlTests' --tests '*NicknameAvailabilityMySqlTests' --tests '*UserOnboardingMySqlTests' --console=plain
# 구현 완료 후 MR 직전 1회
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

선택 실행은 일반 207개/격리 MySQL 29개 통과, 실패·오류·건너뜀 0개다.
신규 검증은 실제 HTTP 28개, 서비스 단위 12개, MySQL 7개다.
HTTP는 실제 loopback 서버/JWT/Security/Principal을 사용하고 회원/수정 DB 경계만 대역이다.
MySQL은 실제 Repository/UNIQUE/트랜잭션과 USER-01·04·온보딩·로그아웃 경계를 검증한다.
동시성 시험은 사전 조회를 같은 트랜잭션의 실제 SQL로 읽은 뒤 barrier를 사용해 두 요청을 동시에 진행시킨다.
MySQL의 실제 UPDATE/UNIQUE 판정 결과는 200 하나/409 하나다.
flush 후 장애와 커밋 실패 주입 시 DB 변경이 롤백되는 것도 확인한다.
최초 MySQL 테스트 2개 실패는 추상 Repository 메서드에 callRealMethod를 호출한 테스트 장치 오류였다.
실제 SQL/EntityManager.flush로 수정한 후 테스트를 제외하지 않고 재실행해 통과했다.

2026-10-22 MR 전 전체 회귀는 1회 실행했고 BUILD SUCCESSFUL(5분31초)로 완료했다.

| 태스크 | 통과 | 실패/오류/건너뜀 |
| --- | ---: | ---: |
| test | 1,123 | 0 |
| flowTest | 43 | 0 |
| mysqlTest | 148 | 0 |

flowTest는 일부 기본 사례를 다시 실행하므로 서로 다른 테스트 수로 합산하지 않는다.
git diff --check 통과. 기존 V1~V3/Flyway 재실행/JPA validate 회귀도 포함한다.
개발 ontop_dev의 users/refresh_tokens 집계 지문과 Flyway 이력은 검증 전후 동일했다.
기존 격리 DB/컨테이너만 재사용했으며 DB/볼륨/컨테이너 생성·삭제·초기화를 하지 않았다.
실제 공급자 로그인이나 배포 브라우저 수동 검증을 수행했다는 의미는 아니다.
