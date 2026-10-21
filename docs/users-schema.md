# users 스키마 — S15P31B105-80

## 범위

첫 Flyway migration `backend/src/main/resources/db/migration/V1__create_users.sql`로 users만 생성한다.
User Entity·LoginProvider·CharacterGender enum·UserRepository를 `com.ssafy.ontop.user`에 둔다.
S15P31B105-80의 범위는 스키마·Entity·Repository다. 이후 AUTH-02에서 콜백·기존 계정 복구를 추가했다.
JWT·Refresh 발급은 이후 [인증 교환 API](auth-exchange.md)에서 구현했다.
가입/온보딩 API·탈퇴 API·삭제 배치는 아직 없다. OAuth 인증 성공만으로 users에 저장하지 않는다.
현재 로그인 상태 분기는 [AUTH-02](auth-callback.md)를 따른다.

## 컬럼과 제약조건

| 컬럼 | MySQL 자료형 | NULL | 비고 |
| --- | --- | --- | --- |
| id | BIGINT | 불가 | PRIMARY KEY, AUTO_INCREMENT |
| login_provider | VARCHAR(20) | 불가 | SSAFY / NAVER |
| provider_user_id | VARCHAR(255) | 불가 | 공급자 식별자, 대소문자 구분 |
| nickname | VARCHAR(8) | 불가 | 전체 사용자 UNIQUE, 대소문자 무시 |
| character_gender | VARCHAR(10) | 불가 | MALE / FEMALE |
| created_at | TIMESTAMP(3) | 불가 | JPA 최초 저장 시각 |
| updated_at | TIMESTAMP(3) | 불가 | JPA 최초 저장 및 수정 시각 |
| deleted_at | TIMESTAMP(3) | 허용 | 정상 사용자 NULL, 탈퇴 시각 보관용 |

- `uk_users_login_provider_provider_user_id`: `(login_provider, provider_user_id)` UNIQUE.
- `uk_users_nickname`: nickname UNIQUE. 탈퇴 여부에 따른 예외는 없다.
- `ck_users_login_provider`: `login_provider IN ('SSAFY', 'NAVER')`.
- `ck_users_character_gender`: `character_gender IN ('MALE', 'FEMALE')`.
- 외래 키·연쇄 삭제·다른 도메인 테이블은 없다.

## 닉네임 형식과 collation

확정된 입력 정책은 **1~8자, 한글 완성형(가-힣)·영문 대소문자(A-Z/a-z)·숫자(0-9)만 허용**이다.
공백·특수문자·이모지는 허용하지 않는다. 해당 정규식 검증은 USER-04/USER-05에서 구현한다.
이번 Entity에는 입력 정규식·길이 검증 서비스·닉네임 API를 추가하지 않았다.
VARCHAR(8)·NOT NULL·UNIQUE만으로 빈 문자열과 잘못된 문자 형식을 모두 막을 수 있는 것은 아니다.

사용자가 확정한 기준에 따라 `OnTop`과 `ontop`은 같은 닉네임이다.
nickname은 `utf8mb4_0900_as_ci`를 명시해 대소문자를 무시하고 악센트는 구분한다.
Repository의 `existsByNickname`도 해당 컬럼 collation으로 비교하므로 UNIQUE와 같은 기준을 사용한다.

테이블 기본값은 `utf8mb4 / utf8mb4_0900_bin`이고 nickname만 위 collation으로 재정의한다.
따라서 DB 기본 collation에 의존하지 않으며, provider_user_id는 원래 대소문자를 구분한다.
CHECK의 enum 값도 소문자·뒤 공백을 다른 값으로 판정해 거절한다.
두 collation은 NO PAD이므로 뒤 공백을 자동 제거하는 규칙은 아니다. 공백 입력 거절은 후속 형식 검증 책임이다.

MySQL은 문자 수로 VARCHAR 길이를 계산하므로 한글 8자도 저장된다.
9자 입력 거절은 strict SQL mode를 전제로 한다. 운영 DB에서도 STRICT_TRANS_TABLES 또는 동등한
strict mode를 유지해야 하며, 비엄격 모드의 자동 잘림을 입력 검증으로 간주하지 않는다.

## JPA와 시각 관리

- `User`는 IDENTITY 방식의 Long ID와 `@Enumerated(STRING)` enum을 사용한다.
- Hibernate에서 enum을 MySQL native ENUM으로 해석하지 않도록 JDBC VARCHAR를 명시한다.
- `nickname`은 JPA `@Column(length = 8)`로 매핑한다.
- 소셜 계정 키·성별·생성 시각에는 `updatable = false`를 적용하고 변경 setter를 제공하지 않는다.
  성별의 온보딩 후 불변 정책을 JPA 갱신 경계에서 유지한다. DB 직접 UPDATE를 막는 트리거는 없다.
- 시각은 Java Instant와 SQL TIMESTAMP(3)로 매핑한다.
- `@PrePersist`에서 created_at·updated_at을 같은 Instant로 채우고,
  `@PreUpdate`에서 updated_at만 갱신한다. 모두 밀리초로 절삭한다.
- `db` 프로필의 Hikari 연결 초기화에서 세션 time_zone을 `+00:00`으로 설정하고,
  Hibernate `hibernate.jdbc.time_zone=UTC`도 적용한다. JVM 기본 시간대와 분리한다.
- DB DEFAULT/ON UPDATE나 JPA Auditing으로 중복 관리하지 않는다.
  직접 SQL·벌크 갱신은 생명주기 콜백을 거치지 않으므로 호출자가 시각을 명시해야 한다.
- JPA `ddl-auto=validate`와 Flyway 적용 순서를 유지한다.

## Repository와 탈퇴 정책 경계

`UserRepository`는 JpaRepository<User, Long>을 확장한다.

- `findByLoginProviderAndProviderUserId(LoginProvider, String)`: 탈퇴 사용자도 조회한다.
- `existsByNickname(String)`: 정상·탈퇴 사용자 전체를 조회한다.
- `findForLogin(LoginProvider, String)`: AUTH-02가 트랜잭션 안에서 사용하는 PESSIMISTIC_WRITE 소셜키 조회다.

전역 soft delete 필터·자동 삭제 SQL·상태별 UNIQUE를 사용하지 않는다.
탈퇴 상태를 숨기지 않고 AUTH-02에서 deleted_at으로 정상·복구·재가입 보류를 판별한다.
정확히 7일 이내는 같은 ID로 복구하고, 7일 초과는 기존 행을 보존하며 409로 보류한다.
탈퇴 시각 기록 API와 영구 삭제는 아직 없다.

**미확정 충돌:** 기존 행을 남긴 채 7일 초과 동일 소셜 계정의 새 행을 추가하면 복합 UNIQUE가 거절한다.
따라서 신규 온보딩을 확정하기 전에 기존 소셜 식별자와 데이터의 보존·해제 방법을 결정해야 한다.
이번에는 기존 식별자 변경·행 삭제·UNIQUE 우회를 하지 않는다.
탈퇴 사용자 닉네임은 행이 유지되는 동안 계속 예약되며, 영구 삭제 정책은 아직 미확정이다.

## 실제 MySQL 검증

기본 `clean build`는 DB 없이 실행하며, 실제 DB 검증은 `mysqlTest`로 분리했다.
Testcontainers·H2 등 추가 의존성은 없다.

검증 담당자가 **별도 빈 MySQL 8.4 DB**와 해당 DB 전용 계정을 준비한다.
테스트 안전장치는 loopback 주소와 `ontop_users80_test_` DB 접두어만 허용한다.
기존 개발/운영 DB를 재사용하거나 초기화하지 않는다.

| 테스트 환경변수 | 용도 |
| --- | --- |
| TEST_DB_URL | 예: `jdbc:mysql://127.0.0.1:3306/ontop_users80_test_local?connectionTimeZone=UTC` |
| TEST_DB_USERNAME | 해당 검증 DB 전용 계정 |
| TEST_DB_PASSWORD | 해당 검증 DB 비밀번호 |

`mysqlTest`는 `db` 프로필을 활성화하고 위 값을 DataSource에 주입한다.
일반 앱의 DB_URL·DB_USERNAME·DB_PASSWORD 사용 방식은 유지한다. `.env`는 자동 로드하지 않는다.
JVM 시간대는 Asia/Seoul로 두고 UTC TIMESTAMP/Instant 왕복을 확인한다.

PowerShell (`backend/`, JDK 21):

```powershell
$env:TEST_DB_URL = 'jdbc:mysql://127.0.0.1:3306/ontop_users80_test_local?connectionTimeZone=UTC'
$env:TEST_DB_USERNAME = Read-Host '검증 DB 전용 사용자'
$env:TEST_DB_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host '검증 DB 비밀번호' -AsSecureString)).Password
.\gradlew.bat mysqlTest
.\gradlew.bat mysqlTest
.\gradlew.bat clean build
.\gradlew.bat flowTest
```

첫 mysqlTest에서 Flyway가 V1·V2를 적용하고 JPA validate가 성공해야 한다.
기존 V1 DB에는 V2 Refresh 테이블만 추가된다. 다음 실행은 두 버전을 다시 적용하지 않고 체크섬을 검증한다.
mysqlTest는 매번 실행되며 UsersMySqlTests의 데이터는 트랜잭션 종료 시 롤백한다.
AUTH-02/인증 교환의 실제 커밋·동시성 fixture는 별도 전용 DB에 보존한다.
테이블·Flyway 이력은 보존한다. Flyway clean·DROP·데이터 초기화는 실행하지 않는다.

검증 항목:

- MySQL 8.4·strict mode·UTC 연결, users·refresh_tokens·이력 테이블이 존재하는지.
- 8개 컬럼 자료형·NULL·밀리초 정밀도·IDENTITY, UNIQUE 2개와 CHECK 2개.
- 동일 소셜키·닉네임·대소문자만 다른 닉네임의 중복 거절.
- 다른 provider의 동일 식별자 허용, 소셜 식별자의 대소문자 구분.
- 한글/ASCII 8자 허용·9자 거절, enum 값·소문자·뒤 공백 거절.
- deleted_at NULL과 탈퇴 사용자 조회·닉네임 예약.
- JPA 저장/조회·시각 갱신·불변 컬럼, Flyway 재실행 시 0개 적용과 데이터 보존.

보고서: `backend/build/reports/tests/mysqlTest/index.html`.
검증 후 임시 컨테이너·볼륨은 이름을 기록하고 보존한다. 삭제 여부는 담당자가 결정한다.

근거: [MySQL Unicode collation](https://dev.mysql.com/doc/refman/8.4/en/charset-unicode-sets.html),
[MySQL collation 명명 규칙](https://dev.mysql.com/doc/refman/8.4/en/charset-collation-names.html).
