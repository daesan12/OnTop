# S15P31B105-115: 운영·개발 앱 배포

이 디렉터리는 Spring Boot API와 Nginx의 **수동 첫 배포**를 기록한다. 운영 DB는 `infra/prod-db/`의 별도 EC2에 있으며 PROD-APP에서 WireGuard `10.77.0.1:3306`으로 접속한다. DEV-CI는 자체 MySQL 볼륨을 사용한다. 어느 앱 컨테이너도 DB 포트를 호스트에 공개하지 않는다. 프론트는 Vercel에서 별도로 배포한다.

2026-10-23에 DEV-CI에 Jenkins를 설치하고 `ci.on-top.world` HTTPS 웹훅 경로를 추가했다. 사용자 승인 후 Jenkins의 Docker·개발 배포 실행 권한도 설정했고 초기 관리자 계정도 생성됐다. 자격 증명 ID 세 개와 `ontop-dev` Pipeline 작업은 등록됐다. 첫 수동 빌드의 GitLab 체크아웃은 성공했으나 브랜치 판별에서 중단됐다. 수정 후 빌드와 GitLab 웹훅 검증을 진행한다. 현재 상태와 절차는 [`../ci/README.md`](../ci/README.md)에 기록한다. 기존 DEV 앱과 DB는 계속 실행 중이다.

## 2026-10-22 운영 배포 상태

- PROD-APP에 `wooaw/ontop-backend:story115-preview-20261022` 이미지(`sha256:a877b391da0fb9e7412cf0fe8f1834e36c84ebeb5e757d9f3f474885e109f5dc`)를 설치했다. 앱은 `db` 프로필과 운영 DB를 사용하며 `healthy` 상태다. Hikari 연결과 Flyway 3개 마이그레이션 성공을 로그에서 확인했다.
- Compose Nginx가 `api.on-top.world`의 80/443을 수신한다. 외부 `https://api.on-top.world/actuator/health`는 `200 {"status":"UP"}`, HTTP는 HTTPS로 `308` 이동, TLS 검증은 성공했다. 인증서 갱신 훅의 Compose Nginx 재로드도 시험했다. 임시 TLS Nginx 컨테이너는 제거했다.
- `app.env`, `deploy.env`, DB 비밀번호는 PROD-APP의 `/etc/ontop/prod-app/`에 저장한다. JWT 키는 서버에서 생성했다. **SSAFY·Naver OAuth 자격 증명은 아직 입력되지 않아 로그인은 사용할 수 없다.** 이미지 태그는 이번 Story 검증용이며 정식 릴리스 태그가 아니다.
- 현재 Flyway는 MySQL 8.4 연결·마이그레이션에 성공했지만, 실행 로그에 해당 Flyway 버전의 최신 시험 지원 버전이 MySQL 8.1이라는 경고가 남는다. 후속 의존성 검토가 필요하다.
- DEV-CI 인스턴스와 개발용 앱/DB는 아래 상태까지 검증했다. 실제 OAuth 로그인, 채널·게임 기능은 아직 검증되지 않았다. Story는 진행 중으로 유지한다.
- Vercel `ontop-frontend` 프로젝트의 Preview와 Production 배포가 모두 `Ready`다. pnpm 11.25.0 의존성 설치와 `tsc --noEmit && vite build`가 성공했다. `frontend/pnpm-workspace.yaml`은 `sharp`의 빌드 스크립트만 허용한다. Preview는 Vercel Authentication으로 보호되며, `vercel curl --head`로 `/`, `/auth/callback`, `/onboarding`, `/park`가 모두 200 HTML을 반환하는 것을 확인했다. 앞선 일반 `vercel deploy` 시도의 Production 설치 오류는 과거 배포 기록이다.
- 가비아의 `@`·`www` DNS는 Vercel로 연결된다. `https://www.on-top.world/`와 `/auth/callback`은 200 HTML, `https://on-top.world/`은 `www`로 308 이동한다. 운영 `www`의 `/api/v1/users/me`는 백엔드 직접 요청과 같이 인증 없는 경우 401 JSON을 반환해 API 전달 경로를 확인했다. `https://api.on-top.world/actuator/health`는 200이다. PROD-APP의 `AUTH_FRONTEND_CALLBACK_URI`는 `https://www.on-top.world/auth/callback`이며 앱은 `healthy`다. SSAFY OAuth 시작 주소는 자격 증명이 없어 현재 500 JSON을 반환한다. WSS와 로그인 왕복은 아직 검증하지 못했다.
- 이번 Vercel Production 배포는 사용자가 CLI로 실행했다. `frontend/vercel.json`과 프론트 WebSocket 도메인 변경은 이후 `dev` 브랜치에 병합됐다. GitLab 푸시로 Vercel을 자동 배포하는 연결은 Story 116에서 진행한다.
- SSAFY Client ID·Secret은 발급받았으나 현재 공급자에 등록된 Redirect URI는 로컬용 `http://localhost:8080/api/v1/auth/ssafy/callback`이다. 운영 로그인을 위해 공급자 등록 주소와 서버의 `SSAFY_REDIRECT_URI`를 `https://www.on-top.world/api/v1/auth/ssafy/callback`으로 일치시켜야 한다. 로컬 주소를 유지해야 하고 하나의 Client에 여러 Redirect URI를 등록할 수 없다면 운영용 Client를 별도로 발급받는다. 로그인 시작 요청은 `www.on-top.world/api/`에서 세션을 발급하고 OAuth `state`와 교환 코드는 같은 세션에서만 검증한다. 공급자 등록과 서버 설정을 맞추기 전까지 운영 OAuth는 미완료다.

## 2026-10-22 개발 배포 상태

- 추가 계정의 DEV-CI 인스턴스는 Ubuntu 26.04.1 LTS, t3.large, 50 GiB 루트 볼륨, 탄력적 IP `3.36.196.164`다. 최초 루트 볼륨 `vol-0d457da4390189a8f`는 암호화되지 않았다. 서울 리전의 EBS 기본 암호화를 활성화하고, 인스턴스를 정상 중지해 만든 직접 스냅샷 `snap-017402faea15b468f`에서 루트 볼륨을 교체했다. 현재 부팅된 볼륨 ID는 `vol-0f814b91a6bd9ee85`이며 사용자가 AWS 콘솔에서 `암호화됨: 예`를 확인했다. 기존 암호화되지 않은 볼륨과 스냅샷의 잔존 상태를 AWS 콘솔에서 확인하고, 복구용으로 더 이상 필요하지 않을 때 정리해야 한다. 사용자는 보안그룹 인바운드가 SSH 22(본인 IP), HTTP 80, HTTPS 443뿐임을 확인했다. Docker Engine 29.9.2와 Compose v5.6.1을 공식 Docker apt 저장소로 설치했다. Jenkins는 Story 116에서 설치한다.
- `/opt/ontop/infra/app`에 이 디렉터리를 배치하고 `bootstrap-dev.sh`로 `/etc/ontop/dev-app/`의 개발 전용 DB 비밀번호 2개와 JWT 키를 서버에서 생성했다. `app.env`·`deploy.env`는 root 0600, MySQL root 비밀번호 파일은 root 0600, 앱 비밀번호 파일은 root:10001 0640이다. `mysql`은 `ontop_dev` DB를 named volume에 보관하며 호스트 포트 3306은 열지 않는다.
- 개발용 Compose의 세 컨테이너는 Docker `local` 로그 드라이버로 각 로그 파일을 최대 10 MiB, 3개까지 보관한다. 기존 MySQL named volume을 유지한 채 Compose 설정을 다시 적용했다.
- 사용자의 비공개 이미지 `wooaw/ontop-backend:story115-preview-20261022`(`sha256:a877b391da0fb9e7412cf0fe8f1834e36c84ebeb5e757d9f3f474885e109f5dc`)를 로컬 Docker 이미지에서 SSH로 복사해 로드했다. DEV-CI 서버에는 Docker Hub PAT를 저장하지 않았다. 앱은 `db` 프로필에서 자체 MySQL에 연결했고 Flyway 3개 마이그레이션이 성공했다. MySQL·앱 컨테이너는 `healthy`다. Flyway의 MySQL 8.4 지원 경고는 운영과 동일하게 남는다.
- 가비아 `dev-api` A 레코드는 이 서버의 탄력적 IP를 가리킨다. Nginx와 Let's Encrypt 인증서를 설정했으며 `https://dev-api.on-top.world/actuator/health`는 외부에서 `200 {"status":"UP"}`, HTTP는 HTTPS로 `308` 이동한다. 인증서 만료일은 2027-01-20이다. 갱신 훅의 인증서 복사·Compose Nginx 재로드와 Certbot 갱신 모의 시험이 성공했다.
- 개발용 SSAFY Client ID·Secret은 넣지 않았고 OAuth 공급자 Redirect URI도 아직 등록하지 않았다. API 헬스가 정상이더라도 로그인·WSS·게임이 동작한다는 뜻은 아니다.
- 저장소의 `frontend/vercel.json`에는 `dev.on-top.world` 호스트의 `/api/*`를 `dev-api.on-top.world`로 보내는 규칙을 추가했고, 프론트 WebSocket도 개발 호스트에서 `wss://dev-api.on-top.world/ws/tables`로 직접 연결하도록 설정했다. 사용자는 별도 Vercel 프로젝트 `ontop-frontend-dev`에 CLI로 배포하고 `dev.on-top.world` DNS를 연결해 사이트 접속을 확인했다. 브라우저에서 `https://dev.on-top.world/api/v1/users/me`를 열었을 때 `AUTH_AUTHENTICATION_REQUIRED` JSON 응답을 확인했다. 인증된 WSS 왕복은 별도로 확인해야 한다.
- Compose 설정을 다시 적용해도 Flyway 스키마 버전 3이 남아 있음을 확인했다. 서버를 재부팅한 뒤 Docker와 세 컨테이너가 자동으로 돌아왔고, 앱 기동 중 잠깐의 502 이후 HTTPS 헬스가 다시 `200`이 됐다. 인증 없는 `/api/v1/users/me`는 401 JSON, 루트 `/`는 Nginx 404를 반환한다. 외부에서 3306·8080 TCP 접속 시험은 3초 제한 시간 안에 연결되지 않았다. Docker와 Certbot 타이머는 부팅 시 활성화로 설정돼 있다.
- 암호화된 루트 볼륨으로 교체한 뒤 SSH에서 현재 볼륨의 시리얼이 `vol0f814b91a6bd9ee85`임을 확인했다. MySQL·앱 컨테이너는 모두 `healthy`, Flyway 스키마 버전은 3으로 유지됐다. 시작 중 일시적 502 후 `https://dev-api.on-top.world/actuator/health`는 TLS 검증을 통과하며 `200 {"status":"UP"}`을 반환했다.
- `https://api.on-top.world/ws/tables`와 `https://dev-api.on-top.world/ws/tables`에 허용된 Origin의 WebSocket Upgrade 요청을 티켓 없이 보냈을 때 둘 다 `401`을 반환했다. Nginx 경로가 백엔드 인증 인터셉터까지 도달하는 것은 확인했지만, 로그인과 일회용 티켓을 사용한 실제 `101 Switching Protocols` 연결은 아직 검증하지 못했다.
- 재부팅 후 메모리 7.6 GiB 중 약 6.4 GiB가 사용 가능했고, 루트 파일시스템은 48 GiB 중 4.6 GiB 사용 중이었다. Jenkins 빌드를 함께 실행할 때의 CPU 크레딧·메모리 사용량은 Story 116에서 다시 측정한다.

현재 `db` 프로필은 인증·DB와 헬스체크를 실행하지만, 채널 조회·게임 구현의 여러 Bean이 `local` 프로필에 묶여 있다. 이 구성을 그대로 운영하면 **전체 게임이 동작한다고 판정할 수 없다.** 백엔드 담당자와 운영 프로필의 Bean·개발 전용 엔드포인트 경계를 확정하기 전에는 `local,db`를 운영 우회책으로 켜지 않는다. GitLab Webhook/Jenkins 자동 배포는 Story 116, 게임 드레인과 blue/green 전환은 Story 118의 범위다.

## 2026-10-23 행동 로그 설정 (S15P31B105-138, 140)

`BEHAVIOR_LOG_ENABLED`의 기본값은 `false`다. `dev,db`와 `db` 프로필에서 동작하므로 프로필은 바꾸지 않는다. 실제 값은 저장소 밖의 `/etc/ontop/{dev-app,prod-app}/app.env`에만 둔다. Compose의 `env_file`을 수정한 뒤에는 `docker compose restart`가 아닌 앱 컨테이너 재생성이 필요하다. 앱 종료 대기 30초는 로그 저장 대기 최대 5초보다 길어 그대로 둔다.

- **DEV:** 행동 로그 코드가 들어 있는 이미지에서 `app.env`에 `BEHAVIOR_LOG_ENABLED=true`를 추가하고 앱 컨테이너만 `up -d --no-deps --force-recreate app`으로 재생성했다. 실행 중인 컨테이너의 변수는 `true`, 앱 헬스는 `healthy`, 외부 `/actuator/health`는 `UP`이다. Flyway V5·V6는 모두 `success=1`이다. 사용자가 로그인하고 공원 채널에 입장한 뒤 유형별 집계에서 `AUTH_LOGIN`, `WS_CONNECTED`, `CHANNEL_JOINED`가 각각 1건, `world_position_samples`가 10건으로 확인됐다(2026-10-23 기준).
- **PROD:** `/etc/ontop/prod-app/app.env`에 같은 값을 미리 추가했다. 현재 앱은 이전 `story115-preview-20261022` 이미지로 계속 실행 중이며 재생성하지 않았다. 행동 로그 코드가 포함된 승인 이미지로 **수동 승격할 때** 앱을 재생성하고 V5·V6 마이그레이션, 환경변수, 헬스를 검증한다. 운영 DB에 테이블을 미리 수동 생성하지 않는다.

DEV 재검증은 서버의 최신 저장소에서 다음처럼 실행한다. 검증 스크립트는 MySQL secret을 컨테이너의 임시 옵션 파일로 읽고 종료 시 지운다. 비밀번호를 명령행 인수나 로그에 넣지 않는다.

```bash
cd /opt/ontop
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env -f infra/app/compose.dev.yaml exec -T app printenv BEHAVIOR_LOG_ENABLED
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env -f infra/app/compose.dev.yaml exec -T mysql sh -s -- ontop_dev < infra/app/verify-behavior-db.sh
```

첫 줄이 `true`, 다음 출력에서 V5·V6가 각각 `success=1`인지 확인한다. 로그인·채널 입장 후 같은 DB 검증을 반복해 `behavior_events`의 이벤트 건수가 증가하는지 본다. 위치 샘플은 해당 기능을 실제로 사용한 뒤 확인한다. 운영에서도 승인 이미지로 승격한 후 PROD-DB의 MySQL 컨테이너에 같은 스크립트를 `ontop` 인수로 실행한다. `false`로 되돌릴 때도 앱 컨테이너를 재생성해야 하며 기존 테이블과 데이터는 남는다. `ontop.behavior.dropped` 지표는 현재 외부 Actuator에 노출하지 않는다. 필요하면 인증된 내부 관측 경로를 별도 설계한다.

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
- DEV-CI는 Ubuntu 26.04 인스턴스에 같은 스크립트로 Docker Engine과 Compose plugin을 설치했다. Jenkins 설정은 [`../ci/README.md`](../ci/README.md)를 따른다.
- 새 DEV-CI 서버에서는 `sudo bash infra/app/bootstrap-dev.sh wooaw/ontop-backend:<태그>`로 저장소 밖의 설정·비밀번호 파일을 처음 한 번 만든다. 이미 존재하는 설정 파일은 재실행해도 덮어쓰지 않는다. 이미지 태그를 바꿀 때는 `/etc/ontop/dev-app/deploy.env`를 별도로 수정한다.
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

DEV 앱의 `/tmp`는 실행 금지(`noexec`)를 유지한다. 첫 `CHANNEL_JOIN`에서 Bullet 물리 엔진이 네이티브 라이브러리를 추출하므로, `compose.dev.yaml`은 UID/GID `10001` 전용의 실행 가능 tmpfs `/run/ontop-native`를 만들고 `JAVA_TOOL_OPTIONS`의 `java.io.tmpdir`로 지정한다. 2026-10-23 DEV에서 `/tmp`만 사용했을 때 WebSocket `101` 직후 채널 입장 응답 없이 연결이 닫혔고, 전용 경로를 적용한 뒤 사용자가 개발 공원 입장을 확인했다. 헬스체크 `200`만으로 채널 입장을 검증했다고 판단하지 않는다.

`bootstrap.conf`는 인증서 발급을 위한 HTTP 경로만 열고 API는 프록시하지 않는다. PROD-APP에서 임시 `ontop-acme-bootstrap`으로 ACME 경로를 검증한 후 `ontop-tls-bootstrap`으로 HTTPS를 준비하고 API에는 503을 반환했다. Certbot 갱신 모의 시험이 성공했다. 앱이 healthy가 된 뒤 임시 컨테이너를 중지하고 Compose Nginx로 전환했으며 외부 health 확인 후 임시 컨테이너를 제거했다. PROD-APP의 WireGuard·DB 연결, Flyway 초기 마이그레이션도 확인했다. DEV-CI의 MySQL·앱·Nginx도 시작해 외부 HTTPS 헬스를 확인했다. 예시의 `manual` 태그는 자리 표시자다. 실제 릴리스에는 커밋 SHA나 릴리스 태그를 기록한다.

## 3. 도메인·HTTPS/WSS

도메인은 가비아에서 구입한 `on-top.world`다. **DNS 호스트** 메뉴가 아닌 **DNS 관리툴 → 레코드 추가**에서 `api` CNAME을 제공 서버의 `k15b105.p.ssafy.io.`로 설정한다. 가비아의 CNAME 값은 끝에 점(`.`)이 필요하다. `dev-api`는 DEV-CI 서버의 탄력적 IP로 연결했다. Vercel 운영 프론트의 대표 주소는 `www.on-top.world`이고 `on-top.world`은 여기로 308 이동한다. 가비아의 `@`와 `www`는 운영 Vercel 프로젝트 Domains 화면의 요구 값으로 설정했다. `dev.on-top.world`은 별도 `ontop-frontend-dev` Vercel 프로젝트의 Production 도메인으로 연결했다. 이 프로젝트의 Production은 운영 프로젝트의 Production과 별개다. Vercel에 표시된 값과 다를 수 있으므로 예시 IP를 복사하지 않는다. SSL 인증서의 발급·갱신은 호스트의 Certbot webroot를 사용한다.

```bash
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /srv/ontop/prod-app/acme -d api.on-top.world
sudo bash infra/app/sync-cert.sh api.on-top.world /etc/ontop/prod-app/tls
sudo sed -i 's@nginx/bootstrap.conf@nginx/tls.conf@' /etc/ontop/prod-app/deploy.env
sudo docker rm -f ontop-tls-bootstrap
sudo docker compose --env-file /etc/ontop/prod-app/deploy.env -f infra/app/compose.prod.yaml up -d nginx
```

Certbot 갱신 후 인증서 복사와 Compose Nginx 재적용을 위해 `certbot-deploy-hook.sh`를 `/etc/letsencrypt/renewal-hooks/deploy/ontop-prod-app.sh`에 `root:root`, `0750`으로 설치한다. 앱이 아직 배포되지 않았으면 인증서만 복사하고, Nginx 컨테이너가 생긴 뒤에는 재로드한다. `sudo certbot renew --dry-run --cert-name api.on-top.world`와 인증서 만료일 확인을 수행한다. Nginx는 `/api/`를 HTTP API로, `/ws/`를 WebSocket Upgrade로 프록시한다. `/actuator/health`는 상태 확인에 사용하고 나머지 경로는 404로 닫는다.

DEV-CI는 `dev-api.on-top.world` 인증서를 `/etc/ontop/dev-app/tls`로 복사하고 `certbot-dev-deploy-hook.sh`를 `/etc/letsencrypt/renewal-hooks/deploy/ontop-dev-app.sh`에 설치했다. `deploy.env`의 Nginx 설정은 `nginx/tls.conf`를 가리킨다. `sudo certbot renew --dry-run --cert-name dev-api.on-top.world --no-random-sleep-on-renew`로 갱신 경로를 시험한다. 마지막 옵션은 수동 시험 때 Certbot의 무작위 대기를 생략한다.

프론트의 HTTP API 호출은 기존 `/api/v1` 상대 경로를 유지한다. `frontend/vercel.json`은 요청 호스트가 `www.on-top.world`일 때 `/api/*`를 `https://api.on-top.world/api/*`로, `dev.on-top.world`일 때 `https://dev-api.on-top.world/api/*`로 전달한다. 따라서 다른 Vercel 호스트가 운영 API에 연결되지 않는다. 쿠키가 필요한 로그인 요청도 브라우저에서는 같은 프론트 주소로 보낸다. WebSocket은 프론트 코드가 `www.on-top.world`에서 `wss://api.on-top.world/ws/tables`로, `dev.on-top.world`에서 `wss://dev-api.on-top.world/ws/tables`로 직접 연결하며, 로컬 개발 주소는 기존 Vite 프록시를 사용한다. `AUTH_ALLOWED_ORIGINS`에는 `www.on-top.world`가 포함되어 있다. Preview의 정적 SPA 경로와 운영 도메인의 인증 없는 API 전달은 확인했다. 개발 도메인은 사용자가 사이트 접속과 인증 없는 API의 `AUTH_AUTHENTICATION_REQUIRED` JSON 응답을 확인했다. 로그인 왕복·인증된 WSS는 아직 검증하지 못했다. `*.vercel.app` Preview에서는 운영 API를 연결하지 않으므로 실제 OAuth·게임 검증에는 운영 커스텀 도메인 또는 별도 dev 환경을 사용한다. Vercel 빌드에 넣는 `VITE_*` 값은 브라우저에 공개되는 주소만 사용하고 비밀번호를 넣지 않는다.

SSAFY 공급자에 등록할 운영 Redirect URI는 `https://www.on-top.world/api/v1/auth/ssafy/callback`이다. 공급자가 이 주소로 브라우저를 돌려보내면 Vercel의 `/api/*` 규칙이 같은 백엔드로 전달한다. 서버의 `SSAFY_REDIRECT_URI`도 정확히 같은 문자열이어야 한다. 로그인 시작과 콜백을 서로 다른 서브도메인으로 나누면 host-only `JSESSIONID`가 콜백에 포함되지 않아 OAuth `state` 및 교환 코드 검증에 실패한다. Client ID·Secret은 서버의 `/etc/ontop/prod-app/app.env`에만 입력하고 저장소·채팅·Vercel 빌드 변수에 넣지 않는다.

개발용 로그인을 연결할 때도 시작과 콜백을 `dev.on-top.world` 한 호스트로 통일하고 `/api/*`를 `dev-api.on-top.world`로 전달한다. 개발 공급자 등록 주소와 `SSAFY_REDIRECT_URI`는 `https://dev.on-top.world/api/v1/auth/ssafy/callback`으로 맞춘다. 공급자 등록과 Client ID·Secret 설정 전에는 DEV-CI의 API 헬스와 DB 연결까지만 검증한다.

## 4. 완료 검증

1. 각 Compose의 `config --quiet`와 백엔드 이미지 빌드가 성공한다.
2. PROD-APP 앱이 `10.77.0.1`의 운영 DB에만 연결하고 DEV-CI 앱은 자체 `mysql`에만 연결한다. 서로 다른 DB 이름·계정·JWT issuer를 확인한다.
3. 외부에서 8080/3306에 직접 연결할 수 없고, HTTP는 HTTPS로 이동한다.
4. 실제 도메인에서 `GET /actuator/health`가 `200`이고, API·로그인 왕복과 WSS `/ws/tables` 연결이 정상이다. health `UP`만으로 게임 흐름을 통과했다고 보지 않는다.
5. Certbot 갱신 시험, 컨테이너/호스트 재시작 후 복구, dev DB 데이터 유지, 이미지 태그 기록을 확인한다.

개발 프론트 도메인과 인증 없는 API 전달은 확인됐으나 OAuth 공급자 등록과 local 전용 게임 Bean의 운영 계약은 미검증 상태다. 해당 검증은 미완료로 남기고 Jira Story를 완료 처리하지 않는다.
