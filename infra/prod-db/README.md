# S15P31B105-114: 운영 DB 분리와 백업·복원

이 디렉터리는 **PROD-DB 전용**이다. PROD-APP의 Spring Boot 컨테이너, 개발 DB, Jenkins 및 Vercel 배포는 후속 Story에서 다룬다. 아래의 `실서버 검증 기록`을 채우기 전에는 Jira 완료 조건이 충족되지 않는다.

## 배치와 접속

```text
PROD-APP (기본 제공 t3.xlarge) ── WireGuard 10.77.0.2/30 ──> PROD-DB (추가 계정 t3.medium)
                                                                ├─ MySQL 8.4.11 / 10.77.0.1:3306
                                                                ├─ 암호화된 EBS /srv/ontop/mysql
                                                                └─ 비공개 S3 백업 버킷
```

두 EC2가 서로 다른 계정/VPC여도 PROD-APP이 PROD-DB의 공인 주소로 **출발하는** WireGuard UDP 51820 연결을 사용한다. 기본 제공 계정의 보안 그룹 변경 권한이나 VPC 피어링을 전제하지 않는다. 실제 서버에서 UDP outbound가 가능한지 먼저 확인해야 한다. PROD-DB 보안 그룹에는 MySQL 3306 inbound 규칙을 만들지 않는다. Docker 포트도 `10.77.0.1`에만 바인딩한다. Docker가 UFW 규칙을 우회할 수 있으므로 포트 공개 여부는 보안 그룹과 실제 리스닝 주소로 확인한다. 연결이 불가능하면 우회 설정을 임의로 적용하지 말고 네트워크 경로를 재설계한다.

PROD-APP의 운영 앱이 사용할 값은 `DB_URL=jdbc:mysql://10.77.0.1:3306/ontop?connectionTimeZone=UTC`, `DB_USERNAME=ontop_app`, 별도 보관한 앱 비밀번호다. 앱 컨테이너 연결 검증은 S15P31B105-115에서 수행한다. 현재 저장소의 일부 백엔드 코드는 `local` 프로필에 묶여 있으므로 이 Story에서 백엔드 코드를 수정하지 않는다.

## 0. AWS 콘솔에서 먼저 준비하기: 추가 계정

1. **크레딧·예산 확인:** Billing and Cost Management → Credits에서 이미 받은 크레딧의 잔액·만료일·적용 서비스를 확인한다. 콘솔 홈의 Explore AWS 활동에 표시된 `US$0 / US$100`은 아직 획득하지 않은 추가 활동 크레딧이다. Budgets 활동은 서버를 만들기 전에 수행할 수 있다. 보유 크레딧과 별도로 **크레딧 차감 전 사용량**을 감시할 비용 예산을 만든다. 활동 완료 후 Credits에 실제 지급됐는지 확인한다. RDS/Bedrock/Lambda는 활동만을 위해 장시간 실행하지 않는다.
2. **리전:** 오른쪽 위에서 `아시아 태평양(서울) ap-northeast-2`를 고른다. 이후 키 페어·보안 그룹·EC2를 같은 리전에서 생성한다.
3. **키 페어:** EC2 → 네트워크 및 보안 → 키 페어 → 키 페어 생성. 이름 예시 `ontop-prod-db-key`, 유형 `ED25519`(Ubuntu/Linux), 파일 형식 `.pem`(Windows PowerShell의 OpenSSH). 생성 즉시 다운로드되는 개인 키를 사용자 PC의 `%USERPROFILE%\.ssh\` 등 저장소 밖에 보관한다. 개인 키는 다시 다운로드할 수 없으므로 파일 내용을 채팅·Jira·Git에 올리지 않는다. DEV-CI 서버의 키는 그 Story에서 별도로 만든다.
4. **보안 그룹:** EC2 → 네트워크 및 보안 → 보안 그룹 → 보안 그룹 생성. 이름 예시 `ontop-prod-db-sg`, 설명 `OnTop production MySQL host`, VPC는 앞으로 PROD-DB EC2를 생성할 VPC로 선택한다. 인바운드에 `SSH / TCP 22 / 내 IP` 한 줄만 먼저 추가한다. `내 IP`는 현재 사용하는 PC의 공인 IPv4 `/32`이며, 다른 장소에서 접속하면 규칙을 갱신해야 한다. 아웃바운드는 초기에는 기본 허용 규칙을 유지한다.
5. **WireGuard 규칙은 나중에 추가:** 기본 제공 PROD-APP의 **공인 출발 IP**를 확인한 뒤 `사용자 지정 UDP / 51820 / 그 IP/32` 한 줄을 PROD-DB 보안 그룹에 추가한다. `MySQL / 3306` 인바운드 규칙은 만들지 않는다. `SSH 22`를 `Anywhere 0.0.0.0/0`로 설정하지 않는다.

여기까지 하면 서버 생성 전 준비가 끝난다. 기록할 값은 키 페어 **이름**, 보안 그룹 **ID**, 선택한 **VPC ID·리전**이다. `.pem` 내용은 기록하거나 전달하지 않는다. 키 페어와 보안 그룹은 EC2 생성 화면의 `기존 키 페어 선택` 및 `기존 보안 그룹 선택`에서 지정한다.

공식 참고: [크레딧 확인](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html), [키 페어 생성](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/create-key-pairs.html), [보안 그룹 생성](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html), [추가 크레딧 활동](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans-activities.html).

## 1. 추가 계정에 자원 생성: 사용자가 수행

1. 서울 리전에 Ubuntu 26.04 `t3.medium` EC2를 만든다. 루트 디스크와 **별도 gp3 데이터 EBS**를 암호화한다. 초기 데이터 용량은 예상 데이터·백업량에 맞춰 정한다. 예를 들어 30 GiB부터 시작할 수 있지만 실제 수치를 비용 계산에 넣는다. EBS는 EC2와 같은 가용 영역에 둔다.
2. DB 서버에 고정 공인 IPv4가 필요한지 결정한다. PROD-APP의 WireGuard `Endpoint`가 사용할 주소다. 고정 주소와 EBS·S3·전송량은 37일 예산에서 컴퓨팅비 외 추가 비용이다.
3. PROD-DB 보안 그룹: SSH 22/TCP는 관리자 접속 IP만, WireGuard 51820/UDP는 PROD-APP의 확인된 공인 출발 IP만 허용한다. **3306/TCP inbound는 추가하지 않는다.** PROD-APP의 공인 출발 IP가 변하면 51820 허용 범위를 갱신해야 한다.
4. 같은 추가 계정에 전용 S3 백업 버킷을 만든다. 서울 리전의 **범용 버킷**과 **계정 리전 네임스페이스**를 고르고 이름 접두어를 `ontop-prod-db-backup`처럼 입력한다. 콘솔이 계정 ID·리전 접미사를 자동으로 붙인다. 모든 퍼블릭 액세스 차단, ACL 비활성화(버킷 소유자 적용), 버전 관리 사용, 기본 암호화 SSE-S3를 선택한다. Object Lock은 이 초기 구성에서 활성화하지 않는다. 생성 후 표시되는 **전체 버킷 이름**을 기록한다. `iam-backup-policy.example.json`의 `REPLACE_BUCKET_NAME`을 이 전체 이름으로 바꿔 IAM → 정책 → 정책 생성 → JSON에 붙여넣고 정책을 만든다. 이 정책만 연결한 **EC2 서비스 역할**을 만든 뒤 EC2 → 인스턴스 → PROD-DB 선택 → 작업 → 보안 → IAM 역할 수정에서 연결한다. 정책은 백업 prefix의 `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`만 허용하며 삭제 권한은 포함하지 않는다. `AmazonS3FullAccess` 정책이나 장기 AWS 액세스 키를 사용하지 않는다. 역할 연결 후 DB 서버에서 `aws sts get-caller-identity`로 인스턴스 역할이 보이는지 확인한다.
5. S3 버킷 → 관리 → 수명 주기 규칙에서 `ontop/prod-db/` prefix에 보관 정책을 설정한다. 초기 운영안은 첫 규칙에서 **현행 객체 30일 후 만료, 비현행 버전 7일 후 영구 삭제, 미완료 멀티파트 업로드 7일 후 삭제**다. `보관할 최신 비현행 버전 수`는 비워둔다. 두 번째 규칙에서 **만료된 삭제 마커 제거**를 설정한다. AWS는 한 규칙에 현행 객체 만료 기간과 만료된 삭제 마커 제거를 동시에 지정하지 못하게 하므로 별도 규칙으로 나눈다. 버전 관리 버킷에서는 현행 객체 만료가 삭제 마커를 만들기 때문에 비현행 버전 만료도 함께 설정해야 저장 비용이 계속 쌓이지 않는다. 실제 보관 기간은 운영 요구에 맞춰 확정한다.
6. AWS Budgets에서 비용·예측 알림을 설정하고 EC2, 데이터 EBS, 공인 IPv4, S3, 전송량, T3 CPU 크레딧을 함께 확인한다. 예산 알림은 자동 결제 차단이 아니다.

## 2. EBS와 도구 설치: PROD-DB

다음 명령은 PROD-DB에 SSH 접속한 뒤 실행한다. `lsblk`의 디스크 일련번호와 AWS 콘솔의 볼륨 ID를 대조해 **새 데이터 EBS인지 확인**한다. 기존 데이터가 있는 볼륨에는 포맷을 실행하지 않는다. `setup-data-volume.sh`는 일련번호가 일치하고 파티션·파일시스템 서명이 없는 새 디스크일 때만 ext4로 포맷한다.

```bash
lsblk -o NAME,SIZE,FSTYPE,UUID,MOUNTPOINT,SERIAL
sudo bash infra/prod-db/setup-data-volume.sh /dev/REPLACE_WITH_DATA_DEVICE vol-REPLACE_WITH_DATA_VOLUME_ID
findmnt -no SOURCE,FSTYPE,TARGET /srv/ontop/mysql
```

스크립트는 확인한 UUID로 `/etc/fstab`에 `UUID=<확인한 UUID> /srv/ontop/mysql ext4 defaults 0 2`를 추가하고 마운트한다. 이 마운트를 `nofail`로 바꾸지 않는다. 볼륨이 빠졌는데 루트 디스크에서 새 DB가 시작되는 상황을 막기 위해 `start.sh`도 마운트 여부를 확인한다.

[Docker 공식 Ubuntu 설치 가이드](https://docs.docker.com/engine/install/ubuntu/)의 apt 저장소 절차를 구현한 `install-docker.sh`로 Docker Engine과 Compose plugin을 설치한다. 서버에 `wireguard`, `awscli`, `openssl`, `nvme-cli`도 설치한다. Docker 명령은 `sudo`로 실행하며 `ubuntu` 계정을 Docker 그룹에 추가하지 않는다.

```bash
sudo apt-get update
sudo apt-get install -y wireguard awscli openssl nvme-cli
sudo bash infra/prod-db/install-docker.sh
sudo docker compose version
wg --version
aws --version
```

## 3. WireGuard 연결: 양쪽 서버

양쪽 서버 각각에서 개인 키를 만들고 공개 키만 교환한다. 개인 키와 실제 `/etc/wireguard/wg0.conf`는 저장소 밖에 두고 root만 읽도록 한다. `init-wireguard-db.sh`는 DB 측 인터페이스를 만들고, `init-wireguard-app.sh`는 PROD-APP에서 DB 공인 IP를 Endpoint로 설정한다. 마지막으로 `add-wireguard-app-peer.sh`가 DB 측에 PROD-APP 공개 키를 등록한다. 초기화 스크립트는 기존 키·설정을 덮어쓰지 않는다.

```bash
# PROD-DB
sudo bash infra/prod-db/init-wireguard-db.sh
sudo cat /etc/wireguard/publickey

# PROD-APP: 공개 키와 DB 탄력적 IP로 설정; 출력된 APP 공개 키를 기록
sudo apt-get install -y wireguard
sudo bash init-wireguard-app.sh REPLACE_DB_PUBLIC_KEY REPLACE_DB_ELASTIC_IP

# PROD-DB: APP 공개 키 등록
sudo bash infra/prod-db/add-wireguard-app-peer.sh REPLACE_PROD_APP_PUBLIC_KEY
sudo wg show
```

PROD-APP에서 `ping -c 3 10.77.0.1`과 `sudo wg show`로 경로/핸드셰이크를 확인한다. ICMP가 차단되어도 `wg show`의 최근 핸드셰이크와 실제 MySQL 접속을 기준으로 판단한다. 서버 간 접속 지연·재시작 후 자동 연결도 시험한다. 양쪽 호스트 방화벽을 쓰는 경우 `wg0` 내부 트래픽만 허용하고 공개 인터페이스의 3306은 계속 차단한다.

## 4. MySQL 시작: PROD-DB

`compose.env.example`을 `/etc/ontop/prod-db/compose.env`로 복사해 `BACKUP_S3_URI`와 실제 IP·경로를 수정한다. 이 파일은 비밀번호를 넣지 않고 root만 수정할 수 있도록 한다. `init-secrets.sh`는 처음 한 번만 실행한다. 기존 파일이 있으면 덮어쓰지 않는다.

```bash
sudo install -d -m 0700 /etc/ontop/prod-db
sudo install -m 0600 infra/prod-db/compose.env.example /etc/ontop/prod-db/compose.env
sudo nano /etc/ontop/prod-db/compose.env
sudo bash infra/prod-db/init-secrets.sh
sudo bash infra/prod-db/start.sh
sudo docker compose --env-file /etc/ontop/prod-db/compose.env -f infra/prod-db/compose.yaml ps mysql
```

`mysql-root-password`와 `mysql-app-password`는 `/etc/ontop/prod-db/secrets/`에만 저장한다. 필요한 앱 비밀번호는 후속 배포 단계에서 안전한 비밀 관리 도구로 전달한다. Doppler를 채택하면 그때 배포 환경과 권한을 연결한다. Compose의 `_FILE` 환경 변수는 파일 경로만 가리키고 실제 비밀번호를 저장소·명령 인자에 쓰지 않는다. 관리 명령은 `admin-client.sh`가 root 비밀번호 secret으로 메모리 파일시스템(`/dev/shm`)에 임시 MySQL 옵션 파일을 만든 뒤 종료할 때 삭제한다. **이미 데이터가 있는 EBS에서 초기화용 환경 변수를 바꿔도 MySQL 사용자 비밀번호가 자동 회전되지는 않는다.**

샘플 `ontop-prod-db.service.example`을 실제 체크아웃 경로에 맞춰 설치하면 Docker, WireGuard, EBS 마운트 이후 MySQL을 시작한다. 경로 예시는 `/opt/ontop/infra/prod-db`다. `sudo systemctl daemon-reload && sudo systemctl enable --now ontop-prod-db.service`로 활성화하고 재부팅 검증을 한다.

PROD-APP에서 MySQL 클라이언트로 실제 쿼리를 확인한다. 암호는 프롬프트에 입력한다.

```bash
mysql --host=10.77.0.1 --port=3306 --user=ontop_app --password \
  --execute='SELECT 1 AS db_reachable, DATABASE() AS current_db;' ontop
```

PROD-DB에서 `sudo ss -lntp | grep 3306`으로 리스닝 주소가 `10.77.0.1:3306`인지 확인한다. 공인 주소나 `0.0.0.0:3306`이면 시작 설정을 수정한다.

## 5. 외부 백업과 격리 복원 시험

`backup.sh`는 `mysqldump --single-transaction`으로 `ontop`을 압축하고 SHA-256 체크섬과 함께 비공개 S3에 올린다. 업로드 중에는 암호화된 EBS 외에 PROD-DB의 임시 디렉터리에 평문 SQL 압축 파일이 잠시 존재하며 종료 시 삭제된다. 비밀번호는 root 전용 Compose secret 파일에서 읽는다. Flyway 스키마 변경 중에는 백업을 피한다. `ontop-prod-db-backup.service.example`와 `.timer.example`을 경로에 맞춰 설치하면 매일 **한국 시간 03:00 (UTC 18:00)**에 실행한다. 첫 수동 백업 성공 후 타이머를 켠다.

```bash
sudo bash infra/prod-db/backup.sh
sudo systemctl daemon-reload
sudo systemctl enable --now ontop-prod-db-backup.timer
sudo systemctl list-timers ontop-prod-db-backup.timer
sudo journalctl -u ontop-prod-db-backup.service -n 50 --no-pager
```

복원 시험은 **운영 DB를 덮어쓰지 않는다.** `restore-test.sh`가 S3에서 백업과 체크섬을 내려받고, 네트워크가 없는 임시 MySQL 컨테이너와 별도 임시 데이터 디렉터리에 복원한 뒤 DB 테이블 수를 출력한다. 시험 종료 시 임시 컨테이너·파일을 제거한다. 대표 테이블의 행 수와 핵심 데이터를 운영 원본과 비교한 결과를 아래에 기록해야 복원 검증이 끝난다.

```bash
sudo bash infra/prod-db/restore-test.sh ontop-prod-YYYYMMDDTHHMMSSZ.sql.gz
# 대표 테이블을 지정하면 복원본 행 수가 예상치와 다른 경우 실패한다.
sudo bash infra/prod-db/restore-test.sh ontop-prod-YYYYMMDDTHHMMSSZ.sql.gz TABLE_NAME EXPECTED_ROWS
```

### 분석용 최신 백업 한 건 받기

분석 담당자는 AWS 콘솔에서 비공개 백업 버킷의 `ontop/prod-db/` 경로를 열고, `ontop-prod-*.sql.gz` 중 **마지막 수정 시간이 가장 최근인 파일 한 개**와 이름이 같은 `.sha256` 파일을 개인 작업 폴더에 내려받는다. 버킷의 퍼블릭 액세스 차단은 유지하고, 접근 권한은 해당 백업 경로의 읽기 권한을 가진 담당자에게만 부여한다. 다운로드 링크나 SQL 원본을 Git, Jira, 채팅에 올리지 않는다.

Windows PowerShell에서 아래처럼 체크섬을 확인한다. `<백업 파일명>`에는 콘솔에서 선택한 실제 파일명을 넣는다. 체크섬이 다르면 파일을 사용하지 않고 다시 받는다.

```powershell
$archive = 'ontop-prod-YYYYMMDDTHHMMSSZ.sql.gz'
$expected = (Get-Content -LiteralPath ".\$archive.sha256" -Raw).Trim().Split(' ')[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath ".\$archive").Hash
if ($actual -ine $expected) { throw 'Backup SHA-256 mismatch' }
```

원본 분석은 네트워크가 분리된 로컬 MySQL에 복원해 수행한다. 결과는 집계값만 공유하고, 작업이 끝나면 로컬 백업 파일과 복원 DB를 삭제한다. 백업에 행동 로그 테이블이 들어오려면 운영 앱의 V5·V6 마이그레이션과 로그 활성화가 먼저 완료돼야 한다.

별도의 재해 복구에서는 새 EBS/EC2를 마련하고 백업을 가져와 복원해야 한다. 이 시험은 SQL 백업의 읽기·복원 가능성을 검증하며 EC2/EBS 전체 복구 시간은 측정하지 않는다. 백업 보관 기간과 목표 RPO/RTO는 서비스 정책으로 확정한다.

## 실서버 검증 기록

37일은 888시간이다. 현재 계획의 t3.medium 참고 단가 $0.052/시간을 적용하면 DB 인스턴스 컴퓨팅비는 약 $46.18이다. 공인 IPv4 한 개의 AWS 공개 단가 $0.005/시간을 적용하면 약 $4.44로, 두 항목의 합계는 **약 $50.62**다. 루트·데이터 gp3 EBS 60 GiB의 37일 저장 비용은 `60 × 서울 리전 gp3 월별 GiB 단가 × 37/30`으로 추가 계산한다. S3 백업, 네트워크 전송, T3 추가 CPU 크레딧과 세금은 사용량에 따라 별도다. AWS 실제 예상 청구액과 적용 크레딧을 확인해 총액을 기록한다. [EBS 요금 계산 방식](https://aws.amazon.com/ebs/pricing/), [공인 IPv4 단가](https://aws.amazon.com/vpc/pricing/)

서버 작업 후 이 표를 채우고 Story의 Acceptance Criteria와 대조한다. 접속 IP, 키, 비밀번호, SQL 데이터, S3 버킷 이름은 공개 문서에 적지 않는다. 아래의 `확인`은 2026-10-22에 실서버에서 확인한 결과이며, AWS 콘솔에서만 확인할 수 있는 항목은 그대로 보류한다.

| 항목 | 결과 / 실행 날짜 / 근거 |
| --- | --- |
| PROD-DB 인스턴스 유형, Ubuntu 버전, EBS 크기·암호화·마운트 | t3.medium, Ubuntu 26.04.1, 루트 30 GiB·데이터 30 GiB 확인. 데이터 EBS ext4 UUID 마운트 확인. 2026-10-22 사용자가 AWS 콘솔에서 루트·데이터 EBS 두 볼륨 모두 `암호화됨` 상태를 확인했다. |
| PROD-APP → PROD-DB WireGuard 핸드셰이크·재연결 | 양쪽 `wg show`에서 최근 핸드셰이크 확인. DB 재부팅 뒤 재연결 확인. |
| PROD-APP → `10.77.0.1:3306` `SELECT 1` | PROD-APP에서 WireGuard 경유 TCP 접속 확인. 2026-10-22 PROD-DB 컨테이너 내부에서 `ontop_app` 계정의 `SELECT CURRENT_USER(), 1` 성공 (`ontop_app@%`, `1`). 사용자의 명시적 허가를 받아 비밀번호를 일회성 SSH 파이프로 PROD-APP의 테스트 프로세스에만 전달해 `SELECT 1 AS db_reachable, DATABASE() AS current_db` 성공 (`1`, `ontop`). APP 서버의 `/dev/shm` 임시 설정 파일이 제거된 것도 확인했다. 실제 Spring Boot 연결과 비밀 관리 도구 연동은 후속 배포 Story에서 검증한다. |
| DB 보안 그룹에 공개 3306 없음, `ss` 리스닝 주소 | 보안 그룹 화면에서 SSH 22와 WireGuard UDP 51820만 확인. DB 호스트 `ss`에서 `10.77.0.1:3306`만 리스닝 확인. |
| 운영 DB와 dev DB의 서버·볼륨·계정 분리 | 운영 MySQL은 전용 PROD-DB EC2와 데이터 EBS에 배치. dev DB는 후속 Story에서 구성 예정이므로 분리의 전체 검증은 보류. |
| S3 백업 파일·체크섬 업로드와 보관 정책 | 전용 S3 버킷·EC2 IAM 역할 연결. 2026-10-22 수동 백업 및 systemd 서비스 실행 성공, S3 목록에서 각 `.sql.gz`와 `.sha256` 확인. 2026-10-22 재확인 시 MySQL healthy, 백업 타이머 active, 다음 실행 2026-10-23 03:00 KST. 사용자가 백업 prefix의 수명 주기 규칙 2개 생성을 완료했다고 보고했고, 첫 규칙 화면에서 현행 객체 30일·비현행 버전 7일·미완료 멀티파트 업로드 7일을 확인했다. 버킷의 `모든 퍼블릭 액세스 차단: 활성화`와 기본 암호화 `SSE-S3`는 사용자 제공 콘솔 화면으로 확인했고, 버전 관리 `활성화`는 사용자가 확인했다. 두 번째 규칙의 실제 설정값은 콘솔 재확인 필요. |
| 격리 복원, 대표 테이블 행 수 비교 | 2026-10-22 S3 백업 다운로드·SHA-256 검증·네트워크 없는 임시 MySQL 복원 성공. 운영 DB에 일시적으로 만든 `infra_restore_probe`의 원본 1행과 복원본 1행 일치. 시험용 테이블 제거 후 운영 DB에 남은 테이블 0개 확인, 깨끗한 상태를 다시 백업. |
| 재부팅 후 EBS·WireGuard·MySQL 자동 시작 | PROD-DB 재부팅 뒤 EBS 마운트, `wg-quick@wg0`, Docker, `ontop-prod-db.service`, MySQL healthcheck 및 내부 쿼리 확인. |
| 37일 예상 비용: EC2/EBS/IPv4/S3/전송량/CPU 크레딧 | t3.medium 컴퓨팅 약 $46.18, 공인 IPv4 한 개 약 $4.44로 알려진 고정 항목 합계 약 $50.62. EBS 60 GiB·S3·전송량·CPU 크레딧·세금 및 적용 크레딧을 포함한 AWS 계정별 예상 청구액 확인 전. |

참고: [MySQL 공식 Docker 이미지](https://hub.docker.com/_/mysql/), [Compose secrets](https://docs.docker.com/reference/compose-file/secrets/), [AWS EBS 마운트](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-using-volumes.html), [S3 보안 권장 사항](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html).
