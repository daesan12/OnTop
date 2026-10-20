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

DB 없는 Raw WebSocket 연결·테이블 착석·퇴장·준비 동기화와 [채널 입장·퇴장·접속 인원 반영](docs/world-websocket-api.md)을 구현했다. 채널별 테이블 분리도 구현했다. 같은 채널의 최신 위치 공유·채팅 송수신 기반도 구현했다. 근거리 채팅 반경·욕설 판정·메시지 보관은 아직 없다. 맵 충돌·속도 판정은 아직 없다. 개발용 기능은 `local` 프로필에서만 활성화된다. DB·정식 인증·실제 게임·재접속 복구·정산은 포함하지 않는다. `/`의 `404`는 정상이다.

### 브라우저에서 광장·채팅 보기

[착석 없는 테이블 상태 구독](docs/websocket-api/08-table-watch.md)도 기존 소켓으로 제공한다. 같은 채널의 착석자·게임 선택·준비 상태를 받으며 좌석·시작 참가자에 포함되지 않는다. 개발 화면의 **테이블 보기 / 보기 종료**로 별도 읽기 전용 상태를 확인한다. 다른 두 탭에서 같은 테이블에 착석·게임 선택·준비하면 구독 탭에도 반영된다. 실제 경기 관전은 아직 없다.

검증용 채널 두 개를 켜려면 `backend/`에서 실행한다. 샘플 설정은 최종 채널 수·정원이 아니다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local,visual-test --server.port=8081'
```

`http://localhost:8081/dev/tables?tab=A`와 `?tab=B`를 두 탭에서 연다. 각 탭에서 **연결하기 → 광장 A → 채널 입장** 후 지도 클릭·채팅을 확인한다. 같은 테이블에 착석하고 첫 착석자가 게임을 선택한 뒤 두 사람 모두 준비한다. 착석 중 이동 버튼은 비활성화된다. 테이블 퇴장·채널 변경·연결 종료도 다른 탭에서 확인할 수 있다.

지도는 위치 동기화를 보는 2D 화면이며 실제 3D 맵이 아니다. 채널 설정이 없으면 기존 테이블 전용 모드를 유지한다. `/dev/world-config`는 local 개발 모드의 설정만 반환하고 실제 사용자·현재 인원은 노출하지 않는다. 인증 모드에서는 이 설정 경로가 404이며 정식 채널 API의 인증은 유지한다. 사용 중인 포트의 서버를 종료하지 말고 다른 포트를 지정한다.

```powershell
cd backend
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

Linux/macOS에서는 `sh ./gradlew bootRun --args='--spring.profiles.active=local'`로 실행한다.

1. [개발 페이지](http://localhost:8080/dev/tables)를 브라우저 2~4개 탭에서 연다.
2. 각 탭에서 연결 → `table-1` 착석 → 첫 착석자가 게임 선택 → 각자 준비를 누른다. 두 화면에 전원 준비 완료가 표시된다.
3. 준비 취소·퇴장·연결 종료를 실행해 상대 탭의 상태 변화를 확인한다.

개발 페이지의 **목록 새로고침**으로 테이블별 착석·준비 인원과 빈자리를 확인한다. [테이블 목록 API](docs/table-query-api.md)는 `GET /api/v1/tables`이며 `local`에서 추가 옵션 없이 사용할 수 있다. 목록은 조회 시점의 상태이고 착석 후 좌석·준비 상태는 WebSocket으로 동기화한다.

[채널 목록 API](docs/channel-query-api.md)는 `GET /api/v1/channels`이며 `local`에서 서버 설정의 채널 정보를 제공한다. 서버 인증 Principal이 필요해 실제 로그인 연결 전에는 직접 조회 시 401이다. 채널 정원을 고정하거나 가짜 사용자를 만들지 않으며, 기본 설정은 빈 채널 목록이다. 실제 광장 입장·인원 동기화는 아직 미연결이다.

`local`은 `127.0.0.1`에 바인딩한다. 동일 출처만 허용하므로 페이지와 WebSocket의 호스트·포트를 일치시킨다. 새 연결은 새 임시 사용자이며 서버 재시작 시 좌석·버전이 초기화된다. 테이블은 `table-1`, `table-2`이며 미선택 시 4석, 오목·주사위는 2석, 원카드·거짓말은 4석이다.

[메시지 명세](docs/websocket-api.md)에 요청·응답과 오류 규칙이 있다. 텍스트 메시지 한도는 16 KiB이며, 연결별 송신 대기열 128개가 가득 차면 해당 연결을 종료하고 좌석을 정리한다. 여러 서버 간 상태 공유나 성능 검증은 아직 하지 않았다.


## 전체 흐름 한 번에 확인

`backend/`에서 실행한다. 서버를 따로 켜지 않아도 된다.

```powershell
.\gradlew.bat flowTest
```

착석·게임 선택·준비·끊김 감지·29초 복귀/30초 만료를 확인한다. 인증·경기 생성은 테스트 대역이다. 단계별 결과와 HTML 보고서는 [도구 안내](docs/flow-test.md)를 참고한다.

[경기 재접속 연결부](docs/game-reconnect.md)는 동일 계정의 추가 연결 차단과 30초 내 최신 경기 복귀를 담당한다. 실제 로그인·경기 엔진은 연결 전이며 테스트 대역으로 검증한다.

[heartbeat](docs/websocket-heartbeat.md)는 기본 10초 주기·10초 응답 제한으로 무응답 연결을 감지한다. 감지 후 기존 연결 권한을 제거하고 30초 재접속 유예로 이어진다. 표준 브라우저는 Ping/Pong을 자동 처리한다.

## 게임 시작 연동 검증

인증 방식 미정 상태의 [웹소켓 인증 연결부](docs/websocket-authentication.md)를 추가했다. `--ontop.websocket.authenticated=true`는 서버 검증기 Bean이 있어야 연결할 수 있으며, 검증기 없이 켜면 503이다. 실제 네이버·SSAFY 로그인은 미구현이다. dev 전용 시작 검증 옵션과 동시에 켤 수 없다.

팀원의 DB 코드 없이 시작 요청·성공·거절·결과 조회를 확인할 수 있다. 실제 엽전이나 게임 기록은 변경하지 않는다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local --ontop.start-rehearsal.enabled=true'
```

명령은 `backend/`에서 실행한다. IntelliJ에서는 활성 프로파일 `local`과 프로그램 인수 `--ontop.start-rehearsal.enabled=true`를 지정한다. 같은 개발 페이지에서 현재 참가자 전원이 준비하면 연동 검증 영역에 결과가 나온다. 이 옵션이 없으면 기존 준비 확인 기능만 동작한다.

제품 흐름은 [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71)를 따른다. 첫 착석자가 게임을 선택하고 전원 준비하면 카운트다운 없이 시작 처리를 요청한다. 선택자가 나가면 남아 있는 참가자에게 권한을 넘긴다. 게임을 바꾸면 전원 다시 준비해야 한다. 실제 서버의 잔액 확인·예약·경기 생성이 성공해야 경기로 넘어갈 수 있다. 현재는 2~4인 local 검증 대역이며 실제 인증·DB·게임 실행은 아직 연결 전이다.

거절·지연 시나리오와 추가 메시지는 [시작 연동 검증 안내](docs/game-start-rehearsal.md)에 있다. 성공 뒤 실제 경기 종료를 구현하지 않았으므로 좌석을 예약한 채 유지하며 새 검증은 다른 테이블이나 서버 재시작으로 수행한다.
