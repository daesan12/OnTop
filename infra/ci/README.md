# Story S15P31B105-116: GitLab Webhook → Jenkins CI/CD

## 구성과 현재 상태

- `ci.on-top.world`은 DEV-CI의 Nginx에서 HTTPS를 종료한다. 외부에는 `/project/` 웹훅만 전달하며 Jenkins 관리 화면은 SSH 터널의 `http://localhost:8081`로 연다. EC2 인바운드에 8081을 추가하지 않는다.
- Jenkins LTS는 DEV-CI에 Java 21, 포트 8081, 최대 힙 1 GiB로 설치했다. Node 24.18.0, pnpm 11.25.0, Vercel CLI 65.1.0도 설치했다.
- `Jenkinsfile`은 `dev` 브랜치의 변경 파일을 분류한다. `backend/` 변경은 Gradle 테스트 → Docker Hub 비공개 이미지 `wooaw/ontop-backend:sha-<전체 커밋 SHA>` → DEV 앱 갱신으로, `frontend/` 변경은 pnpm 테스트·빌드 → 별도 Vercel 프로젝트 `ontop-frontend-dev` 배포로 이어진다. 둘 다 바뀌면 양쪽을 실행한다. 운영 배포는 자동화하지 않는다.
- `analytics/`의 오프라인 쿼리·스크립트만 바뀐 커밋은 `docs/`처럼 앱 빌드·배포 대상에서 제외한다. 다른 백엔드·프론트 변경이 함께 있으면 해당 앱의 기존 분류 규칙을 그대로 적용한다.
- 첫 실행에는 이전 성공 SHA가 없어 양쪽 테스트를 실행하고 기준 SHA만 기록한다. 이미 수동으로 올린 DEV 배포를 이 첫 실행이 교체하지 않는다. 이후 성공한 `dev` 빌드의 SHA를 `/var/lib/jenkins/ontop-state/dev.sha`에 기록한다.
- `infra/app/compose.dev.yaml`의 CI Nginx 설정은 `zz-ci.conf`로 로드한다. 기존 `default.conf`보다 먼저 읽으면 `dev-api`에 CI 인증서가 제공되는 문제가 실제로 발생해 수정했다.
- 인증서 갱신 훅을 수동 호출해 CI 인증서 복사와 Nginx 재로드를 확인했다. 이후 `ci.on-top.world`은 TLS 검증 성공·루트 403, `dev-api.on-top.world/actuator/health`는 TLS 검증 성공·200을 반환했다.
- **남은 설정:** 수정된 `Jenkinsfile`을 `dev`에 반영한 뒤 최초 빌드와 GitLab 웹훅을 검증한다. Jenkins 초기 관리자 생성, GitLab Plugin 설치, 세 자격 증명 ID 등록을 확인했다. `ontop-dev` Pipeline 작업의 GitLab 저장소 URL, `gitlab-ontop-read`, `*/dev`, `Jenkinsfile`, lightweight checkout 설정도 확인했다. 첫 수동 빌드는 GitLab 인증과 체크아웃에 성공했으나, `env.GIT_BRANCH`가 비어 있어 브랜치 검증에서 실패했다. 이 수정에서는 `checkout scm` 반환값을 우선 사용하고, 값이 없으면 체크아웃된 SHA와 `origin/dev`를 대조한다. 실패한 빌드는 테스트·배포 전에 중단돼 기준 SHA와 배포 상태를 바꾸지 않았다. 웹훅 트리거는 첫 성공 빌드 전까지 비활성 상태다. 자격 증명 값은 저장소·Jira·채팅에 남기지 않는다.

## 1. Jenkins 초기 설정

1. PC PowerShell에서 아래 명령을 실행한 창을 열어 둔다. 아무 출력 없이 커서만 있으면 터널이 열린 상태다.

   ```powershell
   ssh -N -L 8081:127.0.0.1:8081 -i "$env:USERPROFILE\.ssh\ontop\ontop-dev-ci-key.pem" ubuntu@3.36.196.164
   ```

2. 다른 PowerShell 창에서 서버에 SSH 접속하고 `sudo cat /var/lib/jenkins/secrets/initialAdminPassword`로 초기 잠금 해제 암호를 **직접 확인한다.** 채팅이나 문서에 복사하지 않는다.
3. 브라우저에서 `http://localhost:8081`을 열어 암호를 입력한다. `Install suggested plugins`를 선택하고 관리자 계정을 만든다. Jenkins URL은 외부 관리 UI가 없으므로 우선 `http://localhost:8081/`로 둔다.
4. `Manage Jenkins → Plugins → Available plugins`에서 **GitLab Plugin** 설치 여부를 확인하고 없으면 설치한다. `Pipeline`, `Git`, `Credentials Binding`, `Timestamper`도 설치됐는지 확인한다. 재시작을 요구하면 완료를 기다린다.

## 2. Jenkins Credentials

`Manage Jenkins → Credentials → System → Global credentials (unrestricted) → Add Credentials`에서 다음을 각각 등록한다. 화면의 `ID`는 정확히 일치해야 한다. 권한은 이 저장소와 개발 배포에 필요한 최소 범위로 만든다.

| ID | Kind | 등록 내용 |
| --- | --- | --- |
| `gitlab-ontop-read` | Username with password | GitLab 프로젝트 Deploy Token의 사용자 이름과 `read_repository` 토큰. Deploy Token을 사용할 수 없다면 저장소 읽기만 허용된 개인 토큰. |
| `dockerhub-ontop-upload` | Username with password | Username `wooaw`, password는 `ontop-backend` 업로드용 Docker Hub PAT(Read & Write). |
| `vercel-ontop-token` | Secret text | 별도 Vercel 토큰. `ontop-frontend-dev` 프로젝트에 배포할 수 있는 계정에서 발급. |

Docker Hub PAT의 **Read & Write**는 빌드 서버에서만 사용한다. 운영 서버의 이미지 다운로드용 Read-only PAT와 재사용하지 않는다. Jenkins 작업 로그에 토큰·비밀번호를 출력하지 않는다.

## 3. Vercel 개발 프로젝트 지정

Jenkins 서버의 `/var/lib/jenkins/ontop-config/vercel-dev.env`에는 아래 두 **ID만** 넣었다. 파일은 `root:jenkins`, 권한 `0640`이다. `VERCEL_PROJECT_ID`는 운영 `ontop-frontend`가 아니라 **`ontop-frontend-dev`의 ID**다. 두 프로젝트의 Vercel owner가 같은 것을 CLI로 확인했고, 기존 프로젝트 링크의 `orgId`를 사용했다. 토큰은 이 파일에 쓰지 않는다.

```dotenv
VERCEL_ORG_ID=team_...
VERCEL_PROJECT_ID=prj_...
```

서버에서 파일 권한을 확인할 때는 `sudo stat -c '%U:%G %a' /var/lib/jenkins/ontop-config/vercel-dev.env`만 실행하고 내용을 출력하지 않는다. 개발 사이트는 `dev.on-top.world`이며, 이 별도 프로젝트의 Production 배포가 개발 URL에 연결된다.
`Jenkinsfile`은 이 개발 프로젝트 ID와 서버 설정이 다르면 배포를 중단한다.

## 4. Pipeline 작업과 웹훅

1. Jenkins에서 `New Item → Pipeline`을 만들고 이름을 `ontop-dev`로 지정한다. 처음에는 Build Triggers를 비워 둔다.
2. Pipeline 정의는 `Pipeline script from SCM`, SCM은 `Git`, Repository URL은 `https://lab.ssafy.com/s15-final/S15P31B105.git`, Credentials는 `gitlab-ontop-read`, Branch Specifier는 `*/dev`, Script Path는 `Jenkinsfile`로 둔다. `Lightweight checkout`을 사용할 수 있으면 켜고 저장한다.
3. 사용자가 이 Story 브랜치를 GitLab에 푸시·MR·병합한 **뒤**, `Build Now`를 한 번 실행한다. 첫 실행은 전체 테스트와 기준 SHA 기록만 수행한다. GitLab 플러그인 문서상 Pipeline 작업의 브랜치 필터는 저장하고 한 번 실행한 뒤에 표시될 수 있다. 첫 빌드가 실패하면 원인을 고친 뒤 다시 실행한다.
4. 첫 빌드가 완료되면 작업 설정의 Build Triggers에서 `Build when a change is pushed to GitLab`을 선택한다. **Push Events**만 사용하고 `Filter branches by name`의 포함 브랜치를 `dev`로 지정한다. `Advanced → Secret Token → Generate`로 작업별 웹훅 토큰을 생성한다. Jenkins 관리 URL을 `localhost`로 두었으므로 화면에는 `http://localhost:8081/project/ontop-dev`가 보일 수 있다. GitLab에 등록할 때는 `https://ci.on-top.world/project/ontop-dev`를 사용한다.
5. GitLab 프로젝트 `Settings → Webhooks`에서 위 HTTPS URL과 Secret Token을 등록한다. Push events를 선택하고 SSL 검증은 켜 둔다. Jenkins 작업과 웹훅 모두 `dev` 브랜치만 다룬다.
6. GitLab 웹훅의 Test Push 이벤트로 HTTP 응답을 확인한다. Test 이벤트가 기본 브랜치 `master`를 사용하면 `dev` 필터 때문에 빌드는 생기지 않을 수 있으므로, 실제 `dev` 병합 이벤트로 Jenkins 빌드 발생도 확인한다. 웹훅 재시도는 같은 커밋에 대한 중복 빌드를 일으킬 수 있으나 파이프라인은 동시 실행을 막고, 동일 이미지 SHA로 DEV 배포를 반복하면 배포 스크립트가 건너뛴다.

자동 배포를 켜기 전에 GitLab에서 `dev`를 보호 브랜치로 설정하고 직접 push를 제한한다. Jenkinsfile 변경도 MR 리뷰를 거치게 한다. `dev`에 코드를 넣을 수 있는 사람은 Jenkins Credentials와 Docker를 사용하는 빌드 코드를 바꿀 수 있기 때문이다.

## 5. 검증과 롤백

- 2026-10-23 첫 수동 Jenkins 빌드는 GitLab 인증·체크아웃 후 브랜치 판별에서 중단됐다. 수정된 `Jenkinsfile`은 서버의 Groovy 문법 검사에 통과했고, 실패한 Jenkins 작업 공간에서 `HEAD`와 `origin/dev`가 같은 SHA임을 확인했다. 같은 작업 공간에서 Jenkins 계정으로 실행한 백엔드 `./gradlew --no-daemon test`는 `BUILD SUCCESSFUL`이었다. 전체 Jenkins 파이프라인은 수정 MR 병합 후 재검증한다.
- 최초 Jenkins 빌드에서 변경 분류, Gradle 테스트, pnpm 테스트·빌드, Compose 구문 검사, 기준 SHA 기록을 확인한다. `FULL_CHECK=1`이면 배포는 건너뛴다.
- Compose 구문 검사는 임시 빈 `app.env`를 사용한다. 실제 `/etc/ontop/dev-app/app.env`는 root 전용이라 Jenkins가 읽지 않으며 검사 로그에도 비밀 값이 나오지 않는다.
- 이후 `backend/`만 바뀐 `dev` 커밋은 프론트 배포 없이, `frontend/`만 바뀐 커밋은 백엔드 이미지 빌드 없이 진행되는지 Jenkins Stage View와 배포 기록으로 확인한다. 실제 배포 검증 전에는 위 자격 증명과 실행 권한 설정이 필요하다.
- 백엔드 배포 도중 앱 헬스체크 또는 `https://dev-api.on-top.world/actuator/health`가 실패하면 `/usr/local/sbin/ontop-deploy-dev`가 이전 이미지로 복구한다. 이 스크립트는 `/etc/ontop/dev-app/deploy.env`의 이미지 태그를 바꾸고 `/var/lib/ontop/ci/dev-deployments.tsv`에 성공 기록을 추가한다.
- Vercel 배포 URL은 Jenkins artifact `frontend/vercel-deployment-url.txt`에 저장한다. 문제가 생기면 Vercel 대시보드에서 `ontop-frontend-dev`의 이전 정상 배포를 Promote하거나 해당 배포 URL로 재배포한다.
- 운영 서비스·운영 DB·운영 Vercel 프로젝트는 자동 배포 대상이 아니다. CI 또는 개발·운영 인프라 경로 변경은 `MANUAL_REVIEW=1`로 표시하고 배포를 건너뛴다. 테스트를 통과하면 빌드가 `UNSTABLE`로 표시되지만 비교 기준 SHA는 기록해 다음 정상 변경이 계속 처리되게 한다. 인프라 적용은 검토 후 수동으로 진행한다.

운영 배포는 후속 전환·롤백 Story에서 승인된 이미지를 수동으로 승격한다. 운영 서버에서 다시 빌드하지 않는다. 배포 기록에는 Git 전체 SHA, `wooaw/ontop-backend:sha-<SHA>` 태그, Docker Hub 이미지 digest, 원본 Jenkins 빌드 URL, 실행 시각·담당자, 배포 전후 헬스 결과와 롤백 여부를 남긴다. 현재의 운영 이미지 태그는 `infra/app/README.md`에 기록된 수동 배포 버전이며, 이 CI Story가 운영 앱을 교체하지 않는다.

## 실행 권한과 위험

Jenkins 서비스 계정은 2026-10-23 사용자의 명시적 승인 후 Docker 그룹에 가입했고, `/usr/local/sbin/ontop-deploy-dev` 실행에만 비밀번호 없는 `sudo`를 허용했다. Jenkins 계정의 Docker API 접속 성공, 배포 스크립트의 잘못된 SHA 거부, 다른 `sudo` 명령 거부를 확인했다. Docker 그룹 자체는 호스트 root와 사실상 동등한 권한이므로 Jenkins 관리자·저장소의 `dev` 브랜치 쓰기 권한·Credentials 접근을 제한해야 한다. Jenkins 웹 관리 화면은 외부에 공개하지 않고 SSH 터널로만 연다.
