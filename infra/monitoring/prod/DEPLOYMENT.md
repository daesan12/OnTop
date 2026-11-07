# PROD 모니터링 반영 안내

Jira S15P31B105-370은 운영 앱 서버에 Prometheus와 MySQL exporter를 배치하고 Grafana는 개인 PC에서
실행하는 구성을 준비한다. 이 폴더의 파일을 저장소에 병합하는 것만으로 운영 서버는 변경되지 않는다.
운영 환경변수, DB 계정과 암호, SSH 개인키는 저장소에 넣지 않는다.

이 구성은 애플리케이션 테이블을 만들거나 변경하지 않으므로 신규 Flyway 마이그레이션이 없다.
운영 이미지 자체에 이미 포함된 미적용 Flyway 버전은 일반 배포 절차에서 별도로 검토한다.

## 2026-11-07 적용 전 기준선

- PROD-APP: 4 vCPU, 메모리 15GiB 중 약 1.5GiB 사용, 사용 가능 약 13GiB
- 루트 디스크: 309GiB 중 7.4GiB 사용(3%), inode 1%
- 앱 메모리: 약 750MiB, 재시작 0회, OOM 0회, health 정상
- Docker 미사용 이미지: 약 2.8GiB. 디스크 여유가 충분하므로 사전 삭제하지 않는다.
- WireGuard 최근 핸드셰이크와 공개 API health가 정상이다.
- 앱과 Nginx의 현재 이미지·Compose·환경 파일을 적용 직전에 다시 기록한다.

## 안전 경계

- Prometheus는 호스트 `127.0.0.1:9090`에만 바인딩한다.
- management 8082, MySQL exporter 9104, DB 3306은 호스트에 게시하지 않는다.
- Nginx는 공개 health 한 경로만 내부 8082로 전달하며 Prometheus 경로는 전달하지 않는다.
- Prometheus와 exporter에 메모리 상한 512MiB와 128MiB, CPU 상한 0.5와 0.15를 둔다.
- PROD Prometheus 보존 기간은 7일, TSDB 크기는 2GB로 제한한다. WAL·이미지·로그까지 포함한 전체
  디스크 상한은 아니므로 실제 사용량을 별도로 관찰한다.
- 운영에서 Hibernate 통계는 기본 비활성화한다. API, Hikari, JVM, WebSocket과 MySQL exporter 지표를
  먼저 사용하고 추가 SQL 통계가 꼭 필요할 때만 부하를 측정한 뒤 켠다.

## 반영 전 필수 확인

1. 최신 운영 DB 백업과 SHA-256 체크섬을 PROD-DB에서 확인한다.
2. 현재 실행 이미지, 컨테이너 시작 시각, 재시작 횟수와 공개 health를 기록한다.
3. PROD-APP의 실제 Docker network가 `ontop-prod-app_default`인지 확인한다.
4. 모니터링 코드가 포함된 백엔드 이미지를 운영 배포 후보로 검증한다.
5. `/etc/ontop/prod-app/app.env`, `deploy.env`, 실행 Compose를 root 전용 파일로 백업한다.
6. PROD-DB에 앱·root 계정과 분리된 읽기 전용 exporter 계정을 준비한다. 호스트 범위와 최소 권한은
   DB 관리자가 실제 WireGuard 연결 경로를 보고 결정한다. 계정 생성은 Flyway로 수행하지 않는다.
7. 운영 앱의 일반 Flyway 적용 대상이 있다면 모니터링 활성화와 분리해 검토한다.

## 서버 외부 비밀 설정

`infra/monitoring/prod/.env.example`을 `/etc/ontop/monitor-prod/monitor.env` 같은 root 전용 경로에
복사한다. exporter 설정은 아래 형식으로 별도 저장한다.

```ini
[client]
user=REPLACE_WITH_PROD_METRICS_READER
password=REPLACE_WITH_PRIVATE_PASSWORD
host=10.77.0.1
port=3306
```

앱 DB 비밀번호와 root 비밀번호를 재사용하지 않는다. 파일을 exporter 컨테이너 UID가 읽을 수 있도록
최소 권한으로 설치하고, 값을 화면이나 Jenkins 로그에 출력하지 않는다.

## 오프라인 구성 검사

```sh
python3 infra/monitoring/prod/check-config.py
```

이 검사는 Compose와 Prometheus 문법 및 외부 노출 경계만 확인한다. 서비스를 설치하거나 DB에 접속하지 않는다.

## 수동 반영 순서

1. 저장소의 `infra/monitoring/prod`를 `/opt/ontop/infra/monitoring/prod`에 설치한다.
2. 기존 PROD Compose에 `compose.app.yaml`을 마지막 overlay로 추가해 결과를 `config --quiet`로 확인한다.
3. 앱과 Nginx만 재생성하고 앱 컨테이너 내부 8082 health와 공개 health를 모두 확인한다.
4. `compose.yaml`로 Prometheus와 exporter를 시작한다.
5. Prometheus target API를 SSH 터널로 조회해 `ontop`, `mysql`, `prometheus`가 모두 UP인지 확인한다.
6. 적용 전후 CPU, 메모리, 디스크, 컨테이너 재시작 횟수를 비교한다.

실제 명령은 운영 백업과 배포 후보 SHA를 확인한 변경 시간에 작성한다. 문서 예시를 그대로 복사해 현재
Compose overlay나 환경 파일을 누락시키지 않는다.

## 팀원 PC의 Grafana 연결

운영 SSH 권한이 승인된 팀원만 로컬 루프백 터널을 연다. 서버의 9090 보안 그룹 규칙을 추가하지 않는다.

```powershell
ssh -N -T -o ExitOnForwardFailure=yes -o IdentitiesOnly=yes `
  -L 127.0.0.1:19092:127.0.0.1:9090 `
  -i "$env:USERPROFILE\.ssh\ontop\K15B105T.pem" `
  ubuntu@k15b105.p.ssafy.io
```

Docker Desktop의 로컬 Grafana 데이터소스 URL은 `http://host.docker.internal:19092`다. 호스트에서
직접 실행하는 Grafana는 `http://127.0.0.1:19092`를 사용한다. `up{deployment="prod"}` 결과에서 세 job이
모두 1인지 확인한다.

## 검증과 롤백

- 로그인, 공원 입장, WebSocket 연결과 짧은 게임 흐름을 실행하고 API·Hikari·MySQL·WebSocket 지표를 확인한다.
- 지표 label에 사용자 ID, 닉네임, 토큰, 요청 본문을 추가하지 않는다.
- 공개 `/actuator/health`는 UP, 공개 `/actuator/prometheus`는 404인지 확인한다.
- 8082·9090·9104·3306이 외부에서 접근되지 않는지 확인한다.
- 장애 시 모니터링 Compose만 중지하고, 앱·Nginx는 백업한 기본 PROD Compose와 기존 프로필 및 healthcheck로
  함께 재생성한다. `down -v`, DB 초기화, Flyway repair는 사용하지 않는다.
