# S15P31B105-115: 운영·개발 앱 배포

이 디렉터리는 Spring Boot API와 Nginx의 **수동 첫 배포**를 기록한다. 운영 DB는 `infra/prod-db/`의 별도 EC2에 있으며 PROD-APP에서 WireGuard `10.77.0.1:3306`으로 접속한다. DEV-CI는 자체 MySQL 볼륨을 사용한다. 어느 앱 컨테이너도 DB 포트를 호스트에 공개하지 않는다. 프론트는 Vercel에서 별도로 배포한다.

## 2026-10-22 운영 배포 상태

- PROD-APP에 `wooaw/ontop-backend:story115-preview-20261022` 이미지(`sha256:a877b391da0fb9e7412cf0fe8f1834e36c84ebeb5e757d9f3f474885e109f5dc`)를 설치했다. 앱은 `db` 프로필과 운영 DB를 사용하며 `healthy` 상태다. Hikari 연결과 Flyway 3개 마이그레이션 성공을 로그에서 확인했다.
- Compose Nginx가 `api.on-top.world`의 80/443을 수신한다. 외부 `https://api.on-top.world/actuator/health`는 `200 {"status":"UP"}`, HTTP는 HTTPS로 `308` 이동, TLS 검증은 성공했다. 인증서 갱신 훅의 Compose Nginx 재로드도 시험했다. 임시 TLS Nginx 컨테이너는 제거했다.
- `app.env`, `deploy.env`, DB 비밀번호는 PROD-APP의 `/etc/ontop/prod-app/`에 저장한다. JWT 키는 서버에서 생성했다. **SSAFY·Naver OAuth 자격 증명은 아직 입력되지 않아 로그인은 사용할 수 없다.** 이미지 태그는 이번 Story 검증용이며 정식 릴리스 태그가 아니다.
- 현재 Flyway는 MySQL 8.4 연결·마이그레이션에 성공했지만, 실행 로그에 해당 Flyway 버전의 최신 시험 지원 버전이 MySQL 8.1이라는 경고가 남는다. 후속 의존성 검토가 필요하다.
- DEV-CI 인스턴스·개발용 앱/DB, Vercel 최종 도메인, 실제 OAuth 로그인, 채널·게임 기능은 아직 검증되지 않았다. Story는 진행 중으로 유지한다.
- Vercel `ontop-frontend` 프로젝트의 Preview 배포가 성공했다. `vercel deploy --environment preview --logs`에서 pnpm 11.25.0 의존성 설치, `sharp` 설치 스크립트, `tsc --noEmit && vite build`, `Ready`를 확인했다. `frontend/pnpm-workspace.yaml`은 `sharp`의 빌드 스크립트만 허용한다. Preview URL은 Vercel Authentication으로 보호되며, 실제 페이지 응답 확인은 아직 수행하지 못했다. 앞선 일반 `vercel deploy` 시도는 Production 대상으로 기록됐으나 의존성 설치 오류로 실패했다. 최종 도메인·API/WSS·로그인 연결과 Production 배포는 아직 남았다.

현재 `db` 프로필은 인증·DB와 헬스체크를 실행하지만, 채널 조회·게임 구현의 여러 Bean이 `local` 프로필에 묶여 있다. 이 구성을 그대로 운영하면 **전체 게임이 동작한다고 판정할 수 없다.** 백엔드 담당자와 운영 프로필의 Bean·개발 전용 엔드포인트 경계를 확정하기 전에는 `local,db`를 운영 우회책으로 켜지 않는다. GitLab Webhook/Jenkins 자동 배포는 Story 116, 게임 드레인과 blue/green 전환은 Story 118의 범위다.

## 저장소 파일과 비밀정보

| 서버 | Compose | 루트 소유 설정 파일 | DB 비밀번호 파일 |
| --- | --- | --- | --- |
| PROD-APP | `compose.prod.yaml` | `/etc/ontop/prod-app/{deploy,app}.env` | `/etc/ontop/prod-app/secrets/db-password` |
| DEV-CI | `compose.dev.yaml` | `/etc/ontop/dev-app/{deploy,app}.env` | `/etc/ontop/dev-app/secrets/mysql-app-password` |

`*.example`은 경로와 변수 계약만 담는다. 실제 `.env`와 TLS 개인키는 저장소 밖에서 `root:root`, `0600`으로 관리한다. 앱은 컨테이너 안에서 UID/GID `10001`로 실행되므로 DB 비밀번호 파일은 **root:10001, 0640**으로 두고 상위 `secrets` 디렉터리는 **root:root, 0700**으로 둔다. Compose의 로컬 파일 secret은 바인드 마운트되므로 `0600`인 root 소유 파일을 비root 앱이 읽을 수 없다. `app.env`의 JWT·OAuth 값도 비밀정보다. dev와 prod에는 서로 다른 JWT 키·OAuth 설정·DB 비밀번호를 사용한다. `docker compose config`는 설정 값을 출력할 수 있으므로 확인할 때는 `config --quiet`만 실행하고, 실제 환경 파일을 터미널·Jira·Git에 출력하지 않는다. Docker 관리자 권한은 컨테이너 환경 값과 secret을 볼 수 있으므로 접근 대상을 제한한다.

## 비공개 백엔드 이미지

백엔드 이미지는 사용자의 Docker Hub 개인 비공개 저장소 `wooaw/ontop-backend`에 보관한다. 저장소 화면에서 자물쇠 표시를 확인했다. `deploy.env`의 `BACKEND_IMAGE`를 `wooaw/ontop-backend:<태그>`로 설정한다. Compose는 이 주소가 없으면 시작하지 않으며 백엔드 이미지를 서버에서 빌드하거나 공개 저장소에 자동 업로드하지 않는다. Nginx, MySQL 등 공개 베이스 이미지는 Docker Hub 로그인 없이 내려받을 수 있다.

Docker Hub 로그인은 사용자가 직접 진행한다. 개인 계정의 Personal access token(PAT)을 **빌드·업로드용 Read & Write**와 **서버 내려받기용 Read-only**로 분리한다. 운영 서버에서 쓰는 토큰은 개인 계정이 접근 가능한 비공개 저장소 전체에 읽기 권한이 있으므로 공유하거나 저장소에 넣지 않는다. 서버의 `sudo docker login -u wooaw`가 묻는 비밀번호 위치에 내려받기용 PAT를 입력하고, root의 Docker 인증 파일 접근을 제한한다. Jenkins에서 이미지 업로드를 자동화할 때는 별도 업로드용 PAT를 Jenkins Credentials에 등록하는 작업을 Story 116에서 진행한다. 토큰 내용은 이 문서·Jira·채팅에 보내지 않는다.

첫 배포 이미지는 비공개 저장소와 업로드 권한을 확인한 뒤 다음 순서로 준비한다. `<태그>`는 Git 커밋 SHA 또는 릴리스 번호를 사용하고 `latest`에만 의존하지 않는다. 시험 이미지 `wooaw/ontop-backend:story115-preview-20261022`는 Docker Hub에 업로드했으며, 인증 없는 Registry 요청이 401로 거부되는 것을 확인했다. 이 태그는 운영 릴리스가 아니다.

```bash
IMAGE="wooaw/ontop-backend:<태그>"
docker build --platform linux/amd64 -t "$IMAGE" backend
docker login -u wooaw
docker push "$IMAGE"
```

`docker push` 전에 Docker Hub 저장소의 `Private` 상태를 다시 확인한다. 첫 PROD-APP 배포에는 로컬에서 이미지를 tar로 저장해 SSH로 전송하고 `docker image load`로 설치했다. 운영 서버에 Docker Hub PAT를 아직 보관하지 않았다. 후속 배포에서 PROD-APP/DEV-CI가 레지스트리에서 직접 내려받으려면 내려받기용 PAT로 로그인하고 `BACKEND_IMAGE`에 같은 태그를 적어 `docker compose pull app`을 실행한다.

현재 운영 설정은 Doppler 없이 서버의 root 전용 파일로 공급한다. DB 비밀번호는 Compose secret 파일, JWT·OAuth 값은 `app.env`에 둔다. 비밀번호 원본을 GitLab/Vercel의 공개 빌드 변수에 복사하지 않는다.

## 1. 서버 준비

- PROD-APP의 실제 버전은 Ubuntu **24.04.4**다. `infra/prod-db/install-docker.sh`는 **Ubuntu 26.04 전용**이므로 사용하지 않는다. 이 디렉터리의 `install-docker.sh`는 공식 Docker apt 저장소로 24.04/26.04에 설치하며, 기존 Docker 또는 충돌 패키지가 있으면 중단한다.
- DEV-CI는 사용자가 생성할 Ubuntu 26.04 인스턴스에 같은 스크립트로 Docker Engine과 Compose plugin을 설치한다. Jenkins는 다음 Story에서 설치한다.
- 두 서버의 호스트 방화벽과 AWS 보안 그룹은 80/443만 서비스용으로 열고, SSH는 관리자 IP로 제한한다. PROD-APP에서 DB의 WireGuard 주소로 접근하는 기존 경로를 유지한다. 앱 8080과 dev MySQL 3306은 외부에 공개하지 않는다.
- 서버 시간 동기화, 디스크 여유, Docker 로그 용량을 확인한다. dev DB의 named volume을 삭제하면 데이터가 사라지므로 `docker compose down -v`를 운영 명령으로 사용하지 않는다.

체크아웃 경로는 예시에서 `/opt/ontop`이다. 실제 경로에 맞춰 `deploy.env`의 `NGINX_CONFIG_FILE`을 수정한다.

```bash
sudo bash infra/app/install-docker.sh
sudo docker compose version
```

```bash
# PROD-APP 예시. DEV-CI는 prod-app을 dev-app으로 바꾸고 dev 예제를 사용한다.
sudo install -d -m 0700 /etc/ontop/prod-app/secrets /etc/ontop/prod-app/tls
sudo install -d -m 0755 /srv/ontop/prod-app/acme
sudo install -m 0600 infra/app/prod.deploy.env.example /etc/ontop/prod-app/deploy.env
sudo install -m 0600 infra/app/prod.app.env.example /etc/ontop/prod-app/app.env
sudoedit /etc/ontop/prod-app/deploy.env
sudoedit /etc/ontop/prod-app/app.env
```

PROD-APP의 `db-password`는 DB 서버의 `ontop_app` 비밀번호와 일치해야 한다. 이 값은 화면·로그에 출력하지 않고 서버 간 SSH 파이프로 설치했다. 앱이 읽도록 `sudo chown root:10001 /etc/ontop/prod-app/secrets/db-password`와 `sudo chmod 0640 /etc/ontop/prod-app/secrets/db-password`를 적용했다. DEV-CI의 `mysql-root-password`와 `mysql-app-password`는 새 난수로 각각 만들고, dev 앱은 후자만 읽는다. dev의 `mysql-app-password`도 앱이 읽을 수 있도록 같은 그룹·권한을 적용한다. 기존 DB 볼륨이 있는 상태에서 비밀번호 파일만 바꾸면 MySQL 계정 비밀번호가 자동으로 바뀌지 않는다.

## 2. 컨테이너 구성 검증과 첫 시작

```bash
# PROD-APP: 인증서 발급 전에는 앱만 시작한다.
sudo docker compose --env-file /etc/ontop/prod-app/deploy.env -f infra/app/compose.prod.yaml config --quiet
# 레지스트리에서 직접 내려받을 때만: 먼저 서버에서 Read-only PAT로 로그인한다.
sudo docker compose --env-file /etc/ontop/prod-app/deploy.env -f infra/app/compose.prod.yaml pull
sudo docker compose --env-file /etc/ontop/prod-app/deploy.env -f infra/app/compose.prod.yaml up -d app
sudo docker compose --env-file /etc/ontop/prod-app/deploy.env -f infra/app/compose.prod.yaml ps

# DEV-CI에서는 /etc/ontop/dev-app/deploy.env와 compose.dev.yaml을 사용하고,
# 먼저 mysql과 app을 시작한다.
```

`bootstrap.conf`는 인증서 발급을 위한 HTTP 경로만 열고 API는 프록시하지 않는다. PROD-APP에서 임시 `ontop-acme-bootstrap`으로 ACME 경로를 검증한 후 `ontop-tls-bootstrap`으로 HTTPS를 준비하고 API에는 503을 반환했다. Certbot 갱신 모의 시험이 성공했다. 앱이 healthy가 된 뒤 임시 컨테이너를 중지하고 Compose Nginx로 전환했으며 외부 health 확인 후 임시 컨테이너를 제거했다. PROD-APP의 WireGuard·DB 연결, Flyway 초기 마이그레이션도 확인했다. DEV-CI는 아직 시작하지 않았다. 예시의 `manual` 태그는 자리 표시자다. 실제 릴리스에는 커밋 SHA나 릴리스 태그를 기록한다.

## 3. 도메인·HTTPS/WSS

도메인은 가비아에서 구입한 `on-top.world`다. **DNS 호스트** 메뉴가 아닌 **DNS 관리툴 → 레코드 추가**에서 `api` CNAME을 제공 서버의 `k15b105.p.ssafy.io.`로 설정한다. 가비아의 CNAME 값은 끝에 점(`.`)이 필요하다. `dev-api`는 DEV-CI 서버를 만든 뒤 해당 서버의 고정 공인 주소로 연결한다. `on-top.world`와 `www.on-top.world`는 Vercel 프로젝트의 Domains 화면에서 요구하는 A/CNAME 값을 가비아에 입력한다. `dev.on-top.world`도 Vercel 개발 프로젝트에 연결한 뒤 해당 화면의 값을 사용한다. Vercel에 표시된 값과 다를 수 있으므로 예시 IP를 복사하지 않는다. `prod.app.env`는 `on-top.world`을 프론트의 대표 주소로 가정한다. Vercel에서 `www`를 대표 주소로 선택했다면 프론트 콜백 주소도 맞춰 바꾼다. SSL 인증서의 발급·갱신은 호스트의 Certbot webroot를 사용한다.

```bash
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /srv/ontop/prod-app/acme -d api.on-top.world
sudo bash infra/app/sync-cert.sh api.on-top.world /etc/ontop/prod-app/tls
sudo sed -i 's@nginx/bootstrap.conf@nginx/tls.conf@' /etc/ontop/prod-app/deploy.env
sudo docker rm -f ontop-tls-bootstrap
sudo docker compose --env-file /etc/ontop/prod-app/deploy.env -f infra/app/compose.prod.yaml up -d nginx
```

Certbot 갱신 후 인증서 복사와 Compose Nginx 재적용을 위해 `certbot-deploy-hook.sh`를 `/etc/letsencrypt/renewal-hooks/deploy/ontop-prod-app.sh`에 `root:root`, `0750`으로 설치한다. 앱이 아직 배포되지 않았으면 인증서만 복사하고, Nginx 컨테이너가 생긴 뒤에는 재로드한다. `sudo certbot renew --dry-run --cert-name api.on-top.world`와 인증서 만료일 확인을 수행한다. Nginx는 `/api/`를 HTTP API로, `/ws/`를 WebSocket Upgrade로 프록시한다. `/actuator/health`는 상태 확인에 사용하고 나머지 경로는 404로 닫는다.

현재 프론트는 `/api/v1`과 `/ws/tables`를 Vercel 페이지의 같은 origin으로 호출한다. 별도 API 도메인을 직접 쓰려면 프론트 주소 설정, 인증 요청의 credentials, 백엔드 Origin·쿠키·OAuth 콜백을 함께 맞춰야 한다. 프론트·백엔드 담당 영역을 수정하기 전 이 계약을 공유한다. `*.vercel.app` 임시 도메인과 별도 API 도메인은 쿠키 관점에서 다른 사이트이므로 로그인 검증에는 최종 커스텀 도메인 조합을 우선 사용한다. Vercel 빌드에 넣는 `VITE_*` 값은 브라우저에 공개되는 주소만 사용하고 비밀번호를 넣지 않는다.

## 4. 완료 검증

1. 각 Compose의 `config --quiet`와 백엔드 이미지 빌드가 성공한다.
2. PROD-APP 앱이 `10.77.0.1`의 운영 DB에만 연결하고 DEV-CI 앱은 자체 `mysql`에만 연결한다. 서로 다른 DB 이름·계정·JWT issuer를 확인한다.
3. 외부에서 8080/3306에 직접 연결할 수 없고, HTTP는 HTTPS로 이동한다.
4. 실제 도메인에서 `GET /actuator/health`가 `200`이고, API·로그인 왕복과 WSS `/ws/tables` 연결이 정상이다. health `UP`만으로 게임 흐름을 통과했다고 보지 않는다.
5. Certbot 갱신 시험, 컨테이너/호스트 재시작 후 복구, dev DB 데이터 유지, 이미지 태그 기록을 확인한다.

DEV-CI 서버, Vercel 최종 도메인, OAuth 공급자 등록과 local 전용 게임 Bean의 운영 계약이 준비되지 않았으므로 해당 검증은 미완료로 남기고 Jira Story를 완료 처리하지 않는다.
