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
