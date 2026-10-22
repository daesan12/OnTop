# USER-04 닉네임 사용 가능 여부 — S15P31B105-101

## API

`GET /api/v1/users/nickname-availability?nickname=온탑고수`

Authorization에는 유효한 온보딩 Bearer 또는 Access JWT 하나를 전달한다. 쿠키는 필요하지 않다.
요청 본문과 회원 ID 파라미터는 사용하지 않는다.

HTTP 200:

```json
{
  "nickname": "온탑고수",
  "available": true
}
```

입력 닉네임은 대소문자를 포함해 그대로 반환한다. 다른 회원이 사용 중이면 available=false다.
현재 활성 회원 본인의 닉네임은 대소문자 변형으로 조회해도 available=true다.
탈퇴 회원의 닉네임은 기존 UNIQUE 정책에 따라 계속 중복으로 처리한다.
응답에는 소셜 식별자, 내부 회원 ID, 인증 토큰을 포함하지 않는다.
성공/오류 응답에 Cache-Control: no-store를 적용한다. 닉네임을 예약하거나 DB를 갱신하지 않는다.

## 한 경로에 한정한 혼합 인증

Security 순서 0의 체인은 이 경로만 처리한다. Stateless/NullSecurityContextRepository를 사용한다.
일반 Resource Server가 온보딩 토큰을 JWT로 먼저 해석하지 않도록 하고,
컨트롤러가 호출하는 NicknameAvailabilityService.check에서 인증을 반드시 먼저 수행한다.
이 체인의 permitAll은 익명 조회 허용이 아니다. 인증 없이는 DB 중복 조회에 도달하지 않는다.
기존 OAuth 별도 인증 체인(순서 1)과 일반 ROLE_MEMBER 체인(순서 2)은 그대로 유지한다.

1. StrictBearerTokenResolver로 단일 Authorization 헤더만 추출한다. 쿼리/쿠키 인증은 받지 않는다.
2. ob_ 토큰은 OnboardingTokenStore.verify로 서버의 해시 저장 항목/600초 만료/미선점 상태를 확인한다.
   온보딩은 서명 JWT가 아닌 256비트 난수 인증이다. 접두사만으로 허용하지 않는다.
   소비·선점·만료 연장은 없으며 일반 ROLE_MEMBER Authentication도 생성하지 않는다.
3. 그 외에는 AccessAuthenticationService.authenticate를 호출한다.
   기존 HS256/Issuer/Audience/typ/token_use/만료/sid 및 활성 회원·로그인 세션 검증을 그대로 사용한다.
4. 본인 제외 ID는 이 검증 결과의 AuthenticatedUser.userId에서만 얻는다.

온보딩 토큰으로 /users/me, 다른 보호 REST 또는 WebSocket 접속권을 사용할 수 없다.
일반 API의 인증 정책을 확장하지 않는다. 로그아웃/탈퇴한 Access는 기존 정책에 따라 401이다.
온보딩 토큰은 조회 도중 다른 요청에서 소비될 수 있다. 조회 응답은 가입 자격을 예약/보장하지 않는다.

## 닉네임 규칙과 DB 비교

NicknameValidator를 온보딩 요청 DTO와 이 API가 공유한다.
허용 형식은 한글 완성형 가-힣, 영문 A-Z/a-z, 숫자 0-9의 2~8자다.
공백/특수문자/이모지/초성/빈 값은 거절한다. trim/소문자 변환 등 입력 보정은 하지 않는다.

신규 회원은 기존 existsByNickname, 기존 회원은 existsByNicknameAndIdNot으로 조회한다.
두 쿼리와 UNIQUE 모두 기존 nickname 컬럼의 utf8mb4_0900_as_ci를 사용하므로 대소문자를 무시한다.
Java의 equalsIgnoreCase나 별도 collation으로 중복 판단을 대체하지 않는다.

USER-05의 최종 중복 검증/DB UNIQUE/트랜잭션/닉네임 충돌 409 재시도는 유지한다.
조회 직후 다른 회원이 선점할 수 있으므로 사용 가능 응답은 가입/닉네임 변경 성공을 보장하지 않는다.
[USER-02 닉네임 수정](user-nickname-update.md)도 실제 수정 트랜잭션에서 최종 중복/UNIQUE 검증을 수행한다.
마이그레이션과 기존 스키마는 변경하지 않는다.

## 오류와 브라우저

기존 {code,message}, RestSecurityErrorHandler, UserOnboardingException 오류 계약을 재사용한다.

| 상태 | code | 상황 |
| --- | --- | --- |
| 400 | USER_INVALID_NICKNAME | 닉네임 누락/형식 오류 |
| 401 | AUTH_AUTHENTICATION_REQUIRED | 인증 헤더 없음 |
| 401 | AUTH_INVALID_ACCESS_TOKEN | Bearer 형식/중복 헤더/잘못된 Access/다른 용도 |
| 401 | AUTH_INVALID_ONBOARDING_TOKEN | 온보딩 위조/만료/소비/선점 중 |
| 401 | AUTH_MEMBER_STATE_CHANGED | Access 회원/로그인 세션 무효 |
| 403 | AUTH_ORIGIN_NOT_ALLOWED | 허용되지 않은 Origin 또는 preflight |
| 503 | AUTH_MEMBER_LOOKUP_UNAVAILABLE | 회원 인증/닉네임 조회 DB 장애 |

401에는 WWW-Authenticate: Bearer를 포함한다. 그 밖의 JWT 설정 오류는 기존 500 계약을 따른다.
인증을 닉네임 검증보다 먼저 수행하므로 인증 없는 잘못된 입력은 401이다.
DB 예외 원문/토큰/소셜 식별자는 로그나 응답으로 내보내지 않는다.

기존 RestCorsFilter와 AUTH_ALLOWED_ORIGINS를 재사용한다.
허용된 Origin의 Authorization 헤더 GET preflight만 정상 처리하고 Credentials는 허용하지 않는다.
프론트는 Authorization: Bearer ...로 호출하며 쿠키 인증에 의존하지 않는다.
일반 REST와 마찬가지로 Origin 없는 Postman 요청은 허용한다.
비local의 허용 Origin은 기존 정책대로 HTTPS여야 한다. local에서만 loopback HTTP를 허용한다.

## Postman

1. local,db와 기존 AUTH 설정으로 실행한다. 토큰을 콘솔/공유 환경/보고서에 출력하지 않는다.
2. OAuth → exchange에서 받은 onboardingToken 또는 accessToken을 Bearer Token에 설정한다.
3. Query Params에 nickname=온탑고수를 넣고 GET을 호출해 200과 available을 확인한다.
4. 동일 온보딩 토큰으로 다시 조회할 수 있어야 하며, 이후 온보딩에 사용할 수 있어야 한다.
5. Access로 현재 닉네임/대소문자 변형을 조회하면 true, 다른 회원 닉네임은 false다.
6. 1자/9자/공백/특수문자/초성은 400, 인증 제거/위조/만료/소비는 401이다.
7. 온보딩 토큰으로 GET /api/v1/users/me는 401이다.
8. 해당 로그인 세션 로그아웃 뒤 기존 Access로 이 API를 호출하면 401이다.
9. DB 장애/탈퇴/동시 선점은 ontop_dev를 변경하지 않고 격리 MySQL 테스트로 검증한다.

Swagger/OpenAPI는 User API 전체 완료 후 도입한다.

## 자동화 검증

backend에서 실행한다. TEST_DB_*와 TEST_SHOP_DB_*는 기존 별도 검증 DB에만 주입한다.
MySQL 테스트는 loopback/ontop_users80_test_* 또는 ontop_shop_test_* 이름을 검증한다.

```powershell
.\gradlew.bat test --tests '*Nickname*Tests' --tests '*UserOnboardingControllerTests' --tests '*UserProfile*Tests' --tests '*RestSecurityTests' --tests '*RestWithoutDatabaseTests' --console=plain
.\gradlew.bat mysqlTest --tests '*NicknameAvailabilityMySqlTests' --tests '*UserOnboardingMySqlTests' --console=plain
# 구현 완료 후 MR 직전 1회
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

선택 실행: 일반 167개/격리 MySQL 20개 통과, 실패·오류·건너뜀 0개.
신규 테스트는 일반 51개(형식 16/서비스 7/실제 HTTP 28)와 MySQL 5개다.
HTTP는 실제 loopback 서버/JWT/온보딩 저장소를 사용하며 회원 DB만 대역이다.
MySQL 테스트는 실제 Repository·인증 발급·로그아웃·온보딩 검증을 사용한다.
선택 실행의 최초 CORS 실패는 비local 테스트에 HTTP Origin을 사용한 fixture 오류였다.
기존 정책에 맞는 HTTPS Origin으로 fixture를 수정한 뒤 통과했으며 운영 CORS 정책을 완화하지 않았다.

2026-10-22 MR 전 전체 회귀는 1회 실행했고 BUILD SUCCESSFUL(5분32초)로 완료했다.

| 태스크 | 통과 | 실패/오류/건너뜀 |
| --- | ---: | ---: |
| test | 1,083 | 0 |
| flowTest | 43 | 0 |
| mysqlTest | 141 | 0 |

flowTest는 일부 기본 사례를 다시 실행하므로 서로 다른 테스트 수로 합산하지 않는다.
git diff --check 통과. 기존 V1~V3/Flyway 재실행/JPA validate 회귀를 포함한다.
개발 ontop_dev의 users/refresh_tokens 집계 지문과 Flyway 이력은 검증 전후 동일했다.
기존 테스트 컨테이너/격리 DB만 재사용했으며 DB/컨테이너/볼륨 생성·삭제·초기화를 하지 않았다.
실제 공급자 로그인/배포 브라우저 동작을 검증했다는 의미는 아니다.
