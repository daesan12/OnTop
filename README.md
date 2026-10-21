# ontop

Java 21 + Spring Boot 3.5.16 백엔드다. 앱은 `backend/`에 있으며 Gradle 8.14.3 Wrapper를 사용한다.

## 실행 준비

JDK 21을 설치하고 `JAVA_HOME`과 `PATH`가 해당 JDK를 가리키도록 설정한다. `java -version`과 Wrapper의 `--version`으로 확인한다. 최초 빌드는 의존성을 내려받을 네트워크 연결이 필요하다. 전역 Gradle 설치는 필요 없다.

Windows 한글 경로에서 Gradle 8의 테스트 실행 인자 파일을 읽을 수 있도록 `gradle.properties`는 Gradle JVM의 기본 인코딩을 OS 기본값(`COMPAT`)에 맞춘다. Java 소스 컴파일 인코딩은 `UTF-8`로 고정한다.

Windows PowerShell:

```powershell
cd backend
.\gradlew.bat --version
.\gradlew.bat clean build
.\gradlew.bat bootRun
```

Linux/macOS:

```sh
cd backend
sh ./gradlew --version
sh ./gradlew clean build
sh ./gradlew bootRun
```

기본 포트는 `8080`이며 서버는 `Ctrl+C`로 종료한다. 포트가 사용 중이면 기존 프로세스를 종료하지 말고 `bootRun --args='--server.port=8081'`처럼 다른 포트를 지정한다.

빌드한 JAR을 직접 실행하려면 `backend/`에서 다음 명령을 사용한다.

```sh
java -jar build/libs/ontop-0.0.1-SNAPSHOT.jar
```

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

## 현재 구현 범위

DB 없는 Raw WebSocket 연결·테이블 착석·퇴장·준비 동기화와 [채널 입장·퇴장·접속 인원 반영](docs/world-websocket-api.md)을 구현했다. 채널별 테이블 분리도 구현했다. 같은 채널의 최신 위치 공유·채팅 송수신 기반도 구현했다. 근거리 채팅 반경·욕설 판정·메시지 보관은 아직 없다. 맵 충돌·속도 판정은 아직 없다. 개발용 기능은 `local` 프로필에서만 활성화된다. DB·정식 인증·실제 게임·재접속 복구·정산은 포함하지 않는다. `/`의 `404`는 정상이다.

### 브라우저에서 광장·채팅 보기

감정표현도 기존 소켓의 WORLD_EMOTE_SEND/WORLD_EMOTE_EVENT로 전달한다. `ontop.world.emote.codes`에 등록한 코드만 허용하고 기본 목록은 비어 있다. `local,visual-test`의 WAVE/CLAP은 검증 코드이며 최종 모션 목록이 아니다. 기본 1초 간격·같은 채널 전달·종료 정리를 구현했다. [광장 명세](docs/world-websocket-api.md)를 참고한다. 개발 화면의 감정표현 선택·보내기로 최근 수신 20건을 확인한다. 실제 모션·AI 감정분류는 아직 없다.

[착석 없는 테이블 상태 구독](docs/websocket-api/08-table-watch.md)도 기존 소켓으로 제공한다. 같은 채널의 착석자·게임 선택·준비 상태를 받으며 좌석·시작 참가자에 포함되지 않는다. 개발 화면의 **테이블 보기 / 보기 종료**로 별도 읽기 전용 상태를 확인한다. 다른 두 탭에서 같은 테이블에 착석·게임 선택·준비하면 구독 탭에도 반영된다. 실제 경기 관전은 아직 없다.

검증용 채널 두 개를 켜려면 `backend/`에서 실행한다. 샘플 설정은 최종 채널 수·정원이 아니다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local,visual-test --server.port=8081'
```

`http://localhost:8081/dev/tables?tab=A`와 `?tab=B`를 두 탭에서 연다. 각 탭에서 **연결하기 → 광장 A → 채널 입장** 후 지도 클릭·채팅을 확인한다. 같은 테이블에 착석하고 첫 착석자가 게임을 선택한 뒤 두 사람 모두 준비한다. 착석 중 이동 버튼은 비활성화된다. 테이블 퇴장·채널 변경·연결 종료도 다른 탭에서 확인할 수 있다.

지도는 위치 동기화를 보는 2D 화면이며 실제 3D 맵이 아니다. 채널 설정이 없으면 기존 테이블 전용 모드를 유지한다. `/dev/world-config`는 local 개발 모드의 설정만 반환하고 실제 사용자·현재 인원은 노출하지 않는다. 인증 모드에서는 이 설정 경로가 404이며 정식 채널 API의 인증은 유지한다. 사용 중인 포트의 서버를 종료하지 말고 다른 포트를 지정한다.

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

```powershell
cd backend
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

Linux/macOS에서는 `sh ./gradlew bootRun --args='--spring.profiles.active=local'`로 실행한다.

1. [개발 페이지](http://localhost:8080/dev/tables)를 브라우저 2~4개 탭에서 연다.
2. 각 탭에서 연결 → `table-1` 착석 → 첫 착석자가 게임 선택 → 각자 준비를 누른다. 두 화면에 전원 준비 완료가 표시된다.
3. 준비 취소·퇴장·연결 종료를 실행해 상대 탭의 상태 변화를 확인한다.

개발 페이지의 **목록 새로고침**으로 테이블별 착석·준비 인원과 빈자리를 확인한다. [테이블 목록 API](docs/table-query-api.md)는 `GET /api/v1/tables`이며 `local`에서 추가 옵션 없이 사용할 수 있다. 목록은 조회 시점의 상태이고 착석 후 좌석·준비 상태는 WebSocket으로 동기화한다.

[채널 목록 API](docs/channel-query-api.md)는 `GET /api/v1/channels`이며 `local`에서 서버 설정과 실제 광장 인원을 제공한다. Access JWT 서명·만료와 활성 계정을 검증하며 기존 서버 Principal도 지원한다. DB 계정 어댑터는 `db` 프로필이 필요하다. 인증 없이 직접 조회하면401이며 기본 설정은 빈 목록이다. 로그인 → 채널 조회 → 접속권 → WS 채널 입장 → 인원 재조회로 연결한다. 실제 외부 OAuth/DB 검증은 별도다.

`local`은 `127.0.0.1`에 바인딩한다. 동일 출처만 허용하므로 페이지와 WebSocket의 호스트·포트를 일치시킨다. 새 연결은 새 임시 사용자이며 서버 재시작 시 좌석·버전이 초기화된다. 테이블은 `table-1`, `table-2`이며 미선택 시 4석, 오목·주사위는 2석, 원카드·거짓말은 4석이다.

[메시지 명세](docs/websocket-api.md)에 요청·응답과 오류 규칙이 있다. 텍스트 메시지 한도는 16 KiB이며, 연결별 송신 대기열 128개가 가득 차면 해당 연결을 종료하고 좌석을 정리한다. 여러 서버 간 상태 공유나 성능 검증은 아직 하지 않았다.


## 전체 흐름 한 번에 확인

`backend/`에서 실행한다. 서버를 따로 켜지 않아도 된다.

```powershell
.\gradlew.bat flowTest
```

채널 입장·이동·채팅·감정표현·테이블 보기·착석·게임 선택·준비·끊김 정리와 기존 29초 복귀/30초 만료를 확인한다. 인증·경기 생성은 테스트 대역이다. 단계별 결과와 HTML 보고서는 [도구 안내](docs/flow-test.md)를 참고한다.

[경기 재접속 연결부](docs/game-reconnect.md)는 동일 계정의 추가 연결 차단과 30초 내 최신 경기 복귀를 담당한다. 실제 로그인·경기 엔진은 연결 전이며 테스트 대역으로 검증한다.

[heartbeat](docs/websocket-heartbeat.md)는 기본 10초 주기·10초 응답 제한으로 무응답 연결을 감지한다. 감지 후 기존 연결 권한을 제거하고 30초 재접속 유예로 이어진다. 표준 브라우저는 Ping/Pong을 자동 처리한다.

## 게임 시작 연동 검증

[로그인 웹소켓 연결](docs/websocket-authentication.md)은 `local,db`와 `--ontop.websocket.authenticated=true`로 실행한다. 로그인 Access JWT로 `POST /api/v1/auth/websocket-ticket`을 호출하고, 받은 최대30초1회용 접속권으로 `/ws/tables?ticket=...`에 연결한다. DB 계정 조회가 없으면503, 접속권이 없거나 무효이면401이다. dev 전용 시작 검증 옵션과 동시에 켤 수 없다. 재접속마다 새 접속권을 받고 기존30초 경기복구 흐름을 따른다.

팀원의 DB 코드 없이 시작 요청·성공·거절·결과 조회를 확인할 수 있다. 실제 엽전이나 게임 기록은 변경하지 않는다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local --ontop.start-rehearsal.enabled=true'
```

명령은 `backend/`에서 실행한다. IntelliJ에서는 활성 프로파일 `local`과 프로그램 인수 `--ontop.start-rehearsal.enabled=true`를 지정한다. 같은 개발 페이지에서 현재 참가자 전원이 준비하면 연동 검증 영역에 결과가 나온다. 이 옵션이 없으면 기존 준비 확인 기능만 동작한다.

제품 흐름은 [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71)를 따른다. 첫 착석자가 게임을 선택하고 전원 준비하면 카운트다운 없이 시작 처리를 요청한다. 선택자가 나가면 남아 있는 참가자에게 권한을 넘긴다. 게임을 바꾸면 전원 다시 준비해야 한다. dev rehearsal과 별도로 [인증 경기 시작 연결](docs/committed-game-start.md)은 확정 커밋 성공 후 실제 엔진/복구를 연결한다. 실제 DB Gateway는 필수이며 기본 옵션은 꺼져 있다. 실제 차감·정산·운영 성공과 연결부 대역 검증을 구분한다.

거절·지연 시나리오와 추가 메시지는 [시작 연동 검증 안내](docs/game-start-rehearsal.md)에 있다. 성공 뒤 실제 경기 종료를 구현하지 않았으므로 좌석을 예약한 채 유지하며 새 검증은 다른 테이블이나 서버 재시작으로 수행한다.
