# DEV 모니터링 반영 안내

DEV에는 Prometheus와 MySQL exporter를 두고 Grafana는 개인 PC에서 실행한다
기존 앱과 DB 데이터 볼륨은 이 모니터링 프로젝트가 생성하거나 제거하지 않는다
운영 서버용 설정이 아니며 자동 설치 스크립트나 신규 Flyway SQL은 없다

## 반영 전 확인

- 실제 DEV 이미지 버전과 여유 메모리 및 디스크를 확인한다
- Prometheus 384MiB와 exporter 96MiB는 메모리 상한이며 실제 필요량을 보장하지 않는다
- 디스크 사용률이 높다는 공유에 따라 TSDB 보존 예시는 12시간과 256MB로 제한했다
- 보존 제한은 이미지와 WAL 및 전체 디스크 사용량의 상한이 아니다
- 기존 DEV Docker network와 앱 alias `app`의 접근을 확인한다
- exporter는 전용 DB 통계 조회 계정을 사용하며 계정 권한과 연결 한도는 인프라 담당자가 검토한다
- 실제 키와 암호 및 서버 환경 파일은 저장소에 넣지 않는다

## 계측 앱 반영

이 MR의 이미지에 Prometheus registry가 포함된다
`observe-dev` 프로필은 `dev`와 함께 쓸 때만 허용되며 `local` 및 운영 프로필 혼합은 거부한다
기존 인증 클래스와 경기 DB 처리 코드는 수정하지 않는다

`infra/app/compose.dev.yaml`에 이 폴더의 `compose.app.yaml`을 추가 overlay로 사용한다
기존 맵 및 저널 overlay와 외부 환경 파일은 유지한다
`SPRING_PROFILES_ACTIVE`는 목록 병합이 아니라 덮어쓰기이므로 기존 Compose와 환경 파일의 활성 프로필을 먼저 확인하고 DEV에서 필요한 기존 목록에 `observe-dev`를 추가하도록 이 overlay 값을 조정한다
예시 `dev,db,observe-dev`를 현재 서버의 전체 프로필 목록이라고 가정하지 않는다
Compose 상대경로는 첫 번째 Compose 파일 기준이므로 기존 배포의 파일 순서를 유지한다
인프라 담당자가 현재 설치 경로와 Jenkins 배포 방식을 대조해 적용해야 한다

이 overlay는 관리 포트를 내부 8082로 옮기므로 Docker healthcheck도 함께 변경한다
기존 8080의 `/actuator/health`를 사용하는 외부 점검이 있다면 그 호출도 조정해야 한다
8082는 호스트에 게시하거나 Nginx로 전달하지 않는다
일반 REST와 WebSocket은 기존 앱 포트와 인증 절차를 유지한다

모니터링 반영 과정에서 미적용 DB 스키마를 실행하지 않도록 overlay의 Flyway는 꺼져 있다
JPA validate는 유지하며 기존 DB가 현재 이미지와 맞는지는 사전에 확인한다
DB 마이그레이션 재활성화는 별도 합의 범위다
기본 DEV Compose와 Jenkins 파일은 이 MR에서 변경하지 않아 머지 자체로 계측 프로필이 켜지지 않는다

## Prometheus와 DB 수집기

`.env.example`을 저장소 밖의 개인 환경 파일로 복사한다
`DEV_APP_NETWORK`는 실제 DEV network로 변경하고 `MYSQL_EXPORTER_CONFIG_FILE`은 전용 설정 파일을 가리킨다
앱과 root DB 암호를 재사용하거나 전달하지 않는다

exporter 설정 파일은 다음 형식이다
이는 형식 예시이며 계정 생성 SQL이나 실제 자격증명이 아니다
Compose file secret은 파일 mount이므로 exporter UID65534가 읽을 수 있게 파일 소유자와 권한을 맞춘다

```ini
[client]
user=REPLACE_WITH_DEV_METRICS_READER
password=REPLACE_WITH_PRIVATE_PASSWORD
host=mysql
port=3306
```

인프라 담당자가 확인한 경로에서 다음 명령으로 구성 검사 후 모니터링 프로젝트만 시작한다

```sh
docker compose --env-file /private/path/monitor-dev.env -f /checkout/infra/monitoring/dev/compose.yaml config --quiet
docker compose --env-file /private/path/monitor-dev.env -f /checkout/infra/monitoring/dev/compose.yaml up -d
```

Prometheus는 허용된 터널 대상인 서버 `127.0.0.1:9090`에만 게시한다
DB와 exporter와 앱 관리 포트는 호스트에 게시하지 않는다
서버에 Grafana를 설치하지 않는다
Jenkins가 모니터링 설정을 자동 설치한다고 가정하지 않는다

## 개인 PC 연결

Windows PowerShell에서 기존 허용된 키를 사용한다
Grafana 컨테이너가 PC의 터널에 접근하도록 로컬 포트는 19091로 구분한다
공용 방화벽 포트를 열거나 터널을 모든 인터페이스에 바인딩하지 않는다

```powershell
ssh -N -T -o ExitOnForwardFailure=yes -o IdentitiesOnly=yes -L 127.0.0.1:19091:127.0.0.1:9090 -i "$env:USERPROFILE\.ssh\ontop-jenkins" ontop-ds@3.36.196.164
```

개인키 암호는 직접 입력하고 공유하지 않는다
`grafana.env.example`을 개인 설정으로 복사하고 비밀 암호 파일 경로를 지정한 뒤 로컬 Grafana만 시작한다

```powershell
docker compose --env-file <개인설정경로> -f compose.grafana-local.yaml up -d
```

로컬 Grafana는 `http://127.0.0.1:13001`에서 로그인한다
Docker Desktop 데이터 소스는 `http://host.docker.internal:19091`이다
호스트에서 직접 Grafana를 실행하는 경우의 `http://localhost:9090`과 구분한다
Linux PC에서도 같은 경로가 동작한다고 가정하지 않는다

## 검수와 복구

- Prometheus의 app 및 MySQL target이 UP인지 확인한다
- Grafana의 18개 지표 패널에 일반 기능 요청 뒤 실제 값이 들어오는지 확인한다
- API 응답시간과 오류율 및 Hikari 연결풀과 DB 통계 및 WebSocket 연결과 전송량을 구분한다
- WS handler 시간은 서버 동기 처리만 측정하며 네트워크와 화면 지연은 포함하지 않는다
- JPA prepared statement와 query count는 MySQL 전체 쿼리 수와 동일하지 않다
- 사용자 ID와 요청 본문 및 토큰을 지표 label에 넣지 않는다
- 요청이 없을 때 p95가 비어 있는 것은 0초 응답을 뜻하지 않는다
- 기존 인증과 WS 접속 및 Docker healthcheck와 자원 사용을 작은 기능 요청으로 확인한다
- 기존 로컬 합성 계정 시드나 부하 도구를 DEV에서 실행하지 않는다

문제가 생기면 이 모니터링 프로젝트만 stop하고 앱은 이전 이미지 및 프로필과 healthcheck로 함께 복원한다
`down -v`나 기존 DB 삭제 및 초기화와 Flyway repair는 사용하지 않는다
서버 설치와 수집 완료는 머지 및 로컬 검증 완료와 별개로 확인한다
