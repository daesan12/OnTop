## MySQL + Flyway

DB가 필요한 실행에서만 `db` 프로필을 추가한다. Spring Boot 3.5.16의 의존성 관리로
Spring Data JPA, MySQL Connector/J, Flyway Core와 MySQL 지원 모듈의 버전을 맞춘다.

| 실행 프로필 | DB 동작 |
| --- | --- |
| 미지정, `local`, `test` (`db` 없음) | DataSource·JPA·Flyway 자동 설정 제외. 기존 DB 없는 실행·테스트 유지 |
| `db` | 환경변수로 MySQL 연결, Flyway 실행 후 JPA 검증 |
| `local,db` | MySQL 연결과 기존 local WebSocket 개발 기능을 함께 사용 |

DB를 사용하는 배포에는 반드시 `db` 프로필을 활성화한다. 환경변수만 설정하고 프로필을 생략하면 DB는 활성화되지 않는다.
`local`의 `127.0.0.1` 바인딩은 `local,db`에서도 유지된다.

### DB 준비와 환경변수

별도 MySQL 서버에서 관리자가 빈 데이터베이스와 해당 DB에 접근할 사용자를 준비한다.
Flyway 이력 테이블과 향후 migration을 실행할 수 있는 권한이 필요하다. 예를 들어 DB만 먼저 준비하려면:

```sql
CREATE DATABASE ontop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

| 필수 환경변수 | 용도 |
| --- | --- |
| `DB_URL` | MySQL JDBC URL. 예: `jdbc:mysql://127.0.0.1:3306/ontop?connectionTimeZone=UTC` |
| `DB_USERNAME` | DB 사용자 이름 |
| `DB_PASSWORD` | DB 비밀번호 |

세 값에는 기본값이 없다. `db` 실행 전 셸·IDE·배포 환경에서 주입한다. 필수 설정이 없거나 DB 연결에 실패하면 앱이 시작되지 않는다.
Spring Boot가 `.env`를 자동으로 읽지는 않는다.
비밀번호를 YAML·JDBC URL·Git에 넣지 않는다. `.env` 파일은 Git 추적에서 제외한다.

PowerShell에서 현재 세션에 설정하고 실행하는 예시 (`backend/`에서 실행):

```powershell
$env:DB_URL = 'jdbc:mysql://127.0.0.1:3306/ontop?connectionTimeZone=UTC'
$env:DB_USERNAME = Read-Host 'DB 사용자 이름'
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'DB 비밀번호' -AsSecureString)).Password
.\gradlew.bat bootRun --args='--spring.profiles.active=local,db'
```

Linux/macOS에서는 세 환경변수를 배포 환경이나 셸에 주입한 뒤 실행한다:

```sh
sh ./gradlew bootRun --args='--spring.profiles.active=local,db'
```

개발 WebSocket이 필요 없는 DB 실행은 `--spring.profiles.active=db`를 사용한다.
빌드된 JAR에도 같은 인수를 전달할 수 있다.

### Migration과 검증

- 경로는 `backend/src/main/resources/db/migration/`이다.
- 파일명은 `V<양의 정수>__<lower_snake_case_설명>.sql`을 사용한다.
  버전 중복 방지·적용된 SQL 관리 규칙은 [migration 안내](backend/src/main/resources/db/migration/README.md)를 따른다.
- JPA `ddl-auto`는 `validate`여서 테이블을 생성·변경하지 않는다. `schema.sql`·`data.sql` 초기화도 비활성화했다.
- `baseline-on-migrate=false`이며 migration 이름과 체크섬을 검증한다.
  이력 없이 이미 테이블이 있는 DB가 거절되면 자동 baseline을 켜지 말고 기존 스키마 편입 방법을 검토한다.
- 현재 migration SQL은 **2개**다. V1은 users, V2는 Refresh 해시 저장용 refresh_tokens를 생성한다.
  컬럼·제약조건·닉네임 정책은 [users 스키마 안내](docs/users-schema.md)를 따른다.

DB 연결 검증은 `db` 프로필로 시작한 뒤 Flyway의 MySQL 연결·검증 로그와 앱 시작 성공을 확인한다.
빈 DB에서는 V1·V2 적용 성공과 JPA 검증 완료를 확인한다. 기존 V1 DB에서는 V2만 추가 적용한다.
재시작 시 현재 버전은 2이고 중복 적용하지 않는다.
생성되는 테이블은 `users`, `refresh_tokens`, Flyway 내부 관리용 `flyway_schema_history`다.
MySQL 클라이언트에서 `SHOW TABLES;`로 확인하고, 이력 테이블이 있다면 다음 조회로 적용 내역을 확인한다:

```sql
SELECT installed_rank, version, description, success
FROM flyway_schema_history
ORDER BY installed_rank;
```

DB가 없어도 기존 회귀 검증은 `backend/`에서 실행할 수 있다:

```powershell
.\gradlew.bat clean build
.\gradlew.bat flowTest
```

이 테스트 통과만으로 실제 MySQL 접속·권한·Flyway 실행을 검증한 것은 아니다.
DB가 없는 환경에서는 해당 항목을 미검증으로 기록한다.
실제 MySQL 8.4에서 users·JPA·Flyway를 확인하는 별도 `mysqlTest` 실행 방법은
[users DB 검증](docs/users-schema.md#실제-mysql-검증)을 참고한다. 기본 `clean build`에는 DB 접속 테스트를 포함하지 않는다.
`db` 프로필의 연결 세션과 Hibernate JDBC 시각은 UTC로 고정한다.

설정 근거: [Spring Boot 3.5 DB 초기화](https://docs.spring.io/spring-boot/3.5/how-to/data-initialization.html),
[관리 의존성](https://docs.spring.io/spring-boot/3.5/appendix/dependency-versions/coordinates.html).

AUTH-01의 `GET /api/v1/auth/{provider}/authorize`는 SSAFY/NAVER 인가 페이지로 302 이동한다.
필요한 환경변수·로컬 실행·공통 state 보관·SSAFY 확인 범위는
[소셜 로그인 시작 API](docs/auth-authorize.md)를 참고한다.
AUTH-02의 `GET /api/v1/auth/{provider}/callback`은 state 검증·공급자 조회·회원 상태 판별 후
60초 일회용 교환 코드만 반환한다. db 프로필이 필요하며 신규 사용자를 저장하지 않는다.
7일 이내 탈퇴 계정은 같은 ID로 복구하고 7일 초과는 데이터를 보존하며 재가입을 보류한다.
AUTH-02 환경변수·오류·프론트 전달·수동 시험은
[콜백 API와 후속 교환 계약](docs/auth-callback.md)을 참고한다.
프론트 callback 주소 미설정 시의 200 JSON은 로컬 수동 검증용 계약이다.
콜백 테스트에는 `local,db`가 필요하며, `local`만 사용하면 고정 진단 로그와 함께 503으로 거절한다.

S15P31B105-89의 `POST /api/v1/auth/exchange`는 동일 세션의 교환 코드를 한 번 소비한다.
기존/복구 회원은 30분 Access JWT와 DB 해시로 저장한 7일 HttpOnly Refresh 쿠키를 받는다.
신규 회원은 users 생성 없이 10분 온보딩 전용 난수 토큰만 받는다.
서명 키 `AUTH_JWT_SECRET_BASE64`는 CSPRNG로 생성해 환경에 주입하며 기본 키는 없다.
[인증 교환 API](docs/auth-exchange.md)에 Origin/CORS·쿠키 설정, 실패 정책, USER-05/Refresh 후속 계약,
Postman 테스트 방법이 있다.

S15P31B105-63의 `POST /api/v1/auth/refresh`는 ONTOP_REFRESH 쿠키로 30분 Access JWT와 새 7일 Refresh를 발급한다.
본문/Bearer/JSESSIONID는 필요 없으며 허용된 Origin 헤더가 필수다. 같은 session_id에서 회전하고 만료를 슬라이딩한다.
V3는 회전 시각만 추가한다. [재발급 API](docs/auth-refresh.md)에 동시 요청·5초 유예·세션 폐기·CSRF·수동 검증 계약이 있다.

S15P31B105-62의 `POST /api/v1/auth/logout`은 현재 Refresh 로그인 계열만 폐기하고 204와 삭제 쿠키를 반환한다.
본문/Bearer/JSESSIONID 없이 허용된 Origin과 Refresh 쿠키를 사용하며 반복/쿠키 누락에도 멱등적이다.
Path=/api/v1/auth를 유지한다. Access JWT는 최대 30분 유효할 수 있어 프론트도 메모리의 JWT를 지워야 한다.
[로그아웃 API](docs/auth-logout.md)에 장애·Rotation 경합·쿠키/Origin·수동 검증 계약이 있다.

S15P31B105-91의 `POST /api/v1/users/onboarding`은 세션에 독립적인 온보딩 Bearer 토큰을 임시 선점하고
2~8자 닉네임·성별로 가입을 확정한다. users와 Refresh 저장은 한 트랜잭션이며 201로 Access JWT를 반환한다.
별도 회원가입 버튼 없이 신규 소셜 계정만 이 흐름을 거친다. 기존 회원은 교환 API에서 바로 로그인한다.
온보딩에는 JSESSIONID가 필요 없다. OAuth 세션과 Refresh 쿠키의 Path는 기존 `/api/v1/auth`다.
가입 성공 시 토큰을 최종 소비한다. 롤백이 확인된 닉네임 중복 409는 최초 10분 만료 전 같은 토큰으로 재시도할 수 있다.
[온보딩 API](docs/user-onboarding.md)에 닉네임 재시도·소셜 계정 중복/기타 실패 재로그인·Bearer/쿠키·수동 테스트 계약이 있다.
OAuth 환경변수 없이도 기본 앱과 기존 WebSocket 개발은 실행되며, 설정이 없는 provider의 인가 요청만 500으로 실패한다.
