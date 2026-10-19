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

## 현재 구현 범위

DB 없는 Raw WebSocket 연결·테이블 착석·퇴장·준비 동기화를 구현했다. 개발용 기능은 `local` 프로필에서만 활성화된다. DB·정식 인증·실제 게임·재접속 복구·정산은 포함하지 않는다. `/`의 `404`는 정상이다.

```powershell
cd backend
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

Linux/macOS에서는 `sh ./gradlew bootRun --args='--spring.profiles.active=local'`로 실행한다.

1. [개발 페이지](http://localhost:8080/dev/tables)를 브라우저 두 탭에서 연다.
2. 각 탭에서 연결 → `table-1` 착석 → 준비를 누른다. 두 화면에 전원 준비 완료가 표시된다.
3. 준비 취소·퇴장·연결 종료를 실행해 상대 탭의 상태 변화를 확인한다.

개발 페이지의 **목록 새로고침**으로 테이블별 착석·준비 인원과 빈자리를 확인한다. [테이블 목록 API](docs/table-query-api.md)는 `GET /api/v1/tables`이며 `local`에서 추가 옵션 없이 사용할 수 있다. 목록은 조회 시점의 상태이고 착석 후 좌석·준비 상태는 WebSocket으로 동기화한다.

`local`은 `127.0.0.1`에 바인딩한다. 동일 출처만 허용하므로 페이지와 WebSocket의 호스트·포트를 일치시킨다. 새 연결은 새 임시 사용자이며 서버 재시작 시 좌석·버전이 초기화된다. 테이블은 `table-1`, `table-2` 각 2석이다.

[메시지 명세](docs/websocket-api.md)에 요청·응답과 오류 규칙이 있다. 텍스트 메시지 한도는 16 KiB이며, 연결별 송신 대기열 128개가 가득 차면 해당 연결을 종료하고 좌석을 정리한다. 여러 서버 간 상태 공유나 성능 검증은 아직 하지 않았다.

구조와 진입점 설명은 [CODE_GUIDE](CODE_GUIDE.md)를 참고한다.

## 게임 시작 연동 검증

팀원의 DB 코드 없이 시작 요청·성공·거절·결과 조회를 확인할 수 있다. 실제 엽전이나 게임 기록은 변경하지 않는다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local --ontop.start-rehearsal.enabled=true'
```

명령은 `backend/`에서 실행한다. IntelliJ에서는 활성 프로파일 `local`과 프로그램 인수 `--ontop.start-rehearsal.enabled=true`를 지정한다. 같은 개발 페이지에서 두 명 모두 준비하면 연동 검증 영역에 결과가 나온다. 이 옵션이 없으면 기존 준비 확인 기능만 동작한다.

거절·지연 시나리오와 추가 메시지는 [시작 연동 검증 안내](docs/game-start-rehearsal.md)에 있다. 성공 뒤 실제 경기 종료를 구현하지 않았으므로 좌석을 예약한 채 유지하며 새 검증은 다른 테이블이나 서버 재시작으로 수행한다.
