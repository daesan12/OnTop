# Story S15P31B105-116: GitLab Webhook → Jenkins CI/CD

새 공원 맵 후보의 checksum·BE 전달본 테스트·별도 `dist-park` 빌드 및 공동 전환 절차는 [PARK_MAP_ROLLOUT.md](../app/PARK_MAP_ROLLOUT.md)를 따른다. 이 CI의 일반 FE 배포는 공동 검증 전까지 기존 맵을 유지한다.

## 구성과 현재 상태

- `ci.on-top.world`은 DEV-CI의 Nginx에서 HTTPS를 종료한다. 외부에는 `/project/` 웹훅만 전달하며 Jenkins 관리 화면은 SSH 터널의 `http://localhost:8081`로 연다. EC2 인바운드에 8081을 추가하지 않는다.
- Jenkins LTS는 DEV-CI에 Java 21, 포트 8081, 최대 힙 1 GiB로 설치했다. Node 24.18.0, pnpm 11.25.0, Vercel CLI 65.1.0도 설치했다.
- `Jenkinsfile`은 `dev` 브랜치의 변경 파일을 분류한다. 테스트는 마지막 테스트 통과 SHA부터, 백엔드와 프론트엔드 배포는 각 서비스의 마지막 배포 성공 SHA부터 변경분을 계산한다. `backend/` 변경은 Gradle 테스트 → Docker Hub 비공개 이미지 `wooaw/ontop-backend:sha-<전체 커밋 SHA>` → DEV 앱 갱신으로, `frontend/` 변경은 pnpm 테스트·빌드 → 별도 Vercel 프로젝트 `ontop-frontend-dev` 배포로 이어진다. 운영 배포는 자동화하지 않는다.
- `analytics/`의 오프라인 쿼리·스크립트만 바뀐 커밋은 `docs/`처럼 앱 빌드·배포 대상에서 제외한다. 다른 백엔드·프론트 변경이 함께 있으면 해당 앱의 기존 분류 규칙을 그대로 적용한다.
- 기존 단일 기준 SHA(`/var/lib/jenkins/ontop-state/dev.sha`)는 **테스트 기준**의 읽기 전용 대체 값으로만 사용한다. 현재는 테스트·백엔드·프론트엔드 배포 기준을 별도 파일로 기록한다. 설정 검토 기준 파일은 Story 258 이후 사용하지 않는다.
- `infra/app/compose.dev.yaml`의 CI Nginx 설정은 `zz-ci.conf`로 로드한다. 기존 `default.conf`보다 먼저 읽으면 `dev-api`에 CI 인증서가 제공되는 문제가 실제로 발생해 수정했다.
- 인증서 갱신 훅을 수동 호출해 CI 인증서 복사와 Nginx 재로드를 확인했다. 이후 `ci.on-top.world`은 TLS 검증 성공·루트 403, `dev-api.on-top.world/actuator/health`는 TLS 검증 성공·200을 반환했다.
- **현재 상태(2026-10-28):** Jenkins 관리자·GitLab Plugin·세 자격 증명 ID·`ontop-dev` Pipeline이 설정됐고, `dev` 푸시 웹훅이 빌드를 시작한다. Story 240의 테스트·배포 기준 분리는 적용됐다. Story 258은 설정 변경의 반복 수동 검토 게이트를 DEV에서 제거한다. 자격 증명 값은 저장소·Jira·채팅에 남기지 않는다.

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
3. 사용자가 이 Story 브랜치를 GitLab에 푸시·MR·병합한 **뒤**, `Build Now`를 한 번 실행한다. 최초 CI 도입 당시에는 전체 테스트와 기준 SHA 기록만 수행했다. 이번 기준 분리 변경의 첫 실행 절차는 아래의 "Story 240 전환"을 따른다. GitLab 플러그인 문서상 Pipeline 작업의 브랜치 필터는 저장하고 한 번 실행한 뒤에 표시될 수 있다. 빌드가 실패하면 원인을 고친 뒤 다시 실행한다.
4. 첫 빌드가 완료되면 작업 설정의 Build Triggers에서 `Build when a change is pushed to GitLab`을 선택한다. **Push Events**만 사용하고 `Filter branches by name`의 포함 브랜치를 `dev`로 지정한다. `Advanced → Secret Token → Generate`로 작업별 웹훅 토큰을 생성한다. Jenkins 관리 URL을 `localhost`로 두었으므로 화면에는 `http://localhost:8081/project/ontop-dev`가 보일 수 있다. GitLab에 등록할 때는 `https://ci.on-top.world/project/ontop-dev`를 사용한다.
5. GitLab 프로젝트 `Settings → Webhooks`에서 위 HTTPS URL과 Secret Token을 등록한다. Push events를 선택하고 SSL 검증은 켜 둔다. Jenkins 작업과 웹훅 모두 `dev` 브랜치만 다룬다.
6. GitLab 웹훅의 Test Push 이벤트로 HTTP 응답을 확인한다. Test 이벤트가 기본 브랜치 `master`를 사용하면 `dev` 필터 때문에 빌드는 생기지 않을 수 있으므로, 실제 `dev` 병합 이벤트로 Jenkins 빌드 발생도 확인한다. 웹훅 재시도는 같은 커밋에 대한 중복 빌드를 일으킬 수 있으나 파이프라인은 동시 실행을 막고, 동일 이미지 SHA로 DEV 배포를 반복하면 배포 스크립트가 건너뛴다.

자동 배포를 켜기 전에 GitLab에서 `dev`를 보호 브랜치로 설정하고 직접 push를 제한한다. Jenkinsfile 변경도 MR 리뷰를 거치게 한다. `dev`에 코드를 넣을 수 있는 사람은 Jenkins Credentials와 Docker를 사용하는 빌드 코드를 바꿀 수 있기 때문이다.

## 5. 검증과 롤백

- 2026-10-23 첫 수동 Jenkins 빌드는 GitLab 인증·체크아웃 후 브랜치 판별에서 중단됐다. 수정된 `Jenkinsfile`은 서버의 Groovy 문법 검사에 통과했고, 실패한 Jenkins 작업 공간에서 `HEAD`와 `origin/dev`가 같은 SHA임을 확인했다. 같은 작업 공간에서 Jenkins 계정으로 실행한 백엔드 `./gradlew --no-daemon test`는 `BUILD SUCCESSFUL`이었다. 전체 Jenkins 파이프라인은 수정 MR 병합 후 재검증한다.
- 최초 Jenkins 빌드에서 변경 분류, Gradle 테스트, pnpm 테스트·빌드, Compose 구문 검사, 기준 SHA 기록을 확인한다. `FULL_CHECK=1`이면 배포는 건너뛴다.
- Compose 구문 검사는 임시 빈 `app.env`를 사용한다. 실제 `/etc/ontop/dev-app/app.env`는 root 전용이라 Jenkins가 읽지 않으며 검사 로그에도 비밀 값이 나오지 않는다.
- 이후 `backend/`만 바뀐 `dev` 커밋은 프론트 배포 없이, `frontend/`만 바뀐 커밋은 백엔드 이미지 빌드 없이 진행되는지 Jenkins Stage View와 배포 기록으로 확인한다. 실제 배포 검증 전에는 위 자격 증명과 실행 권한 설정이 필요하다.
- 백엔드 배포 도중 앱 헬스체크가 실패하면 `/usr/local/sbin/ontop-deploy-dev`가 이전 이미지로 복구한다. 기본 구성은 `https://dev-api.on-top.world/actuator/health`를 확인한다. `/etc/ontop/dev-app/monitoring.enabled`가 있으면 모니터링 overlay를 포함하고 컨테이너 내부 `127.0.0.1:8082/actuator/health`를 확인한다. 이 스크립트는 `/etc/ontop/dev-app/deploy.env`의 이미지 태그를 바꾸고 `/var/lib/ontop/ci/dev-deployments.tsv`에 성공 기록을 추가한다.
- Vercel 배포 URL은 Jenkins artifact `frontend/vercel-deployment-url.txt`에 저장한다. 문제가 생기면 Vercel 대시보드에서 `ontop-frontend-dev`의 이전 정상 배포를 Promote하거나 해당 배포 URL로 재배포한다.
- 운영 서비스·운영 DB·운영 Vercel 프로젝트는 자동 배포 대상이 아니다. DEV에서는 CI·인프라 파일이 바뀌어도 필수 검사와 영향받은 서비스 테스트를 통과하면 앱 배포를 보류하지 않는다. `.gitignore`만 바뀌면 앱 테스트·배포를 다시 실행하지 않는다. 서버에 별도 보관하는 실제 `app.env`나 Compose 파일의 반영은 이 파이프라인이 자동으로 수행하지 않으므로 해당 설정 변경은 별도 운영 절차가 필요하다.

## 테스트와 서비스별 배포 기준 (Story 240, 258)

`/var/lib/jenkins/ontop-state/`에 다음 기준 파일을 각각 둔다. 파일은 Jenkins 계정만 쓸 수 있어야 한다.

| 파일 | 기록 시점 | 용도 |
| --- | --- | --- |
| `tested.sha` | 필수 검사와 해당 백엔드·프론트엔드 테스트가 모두 통과한 직후 | 다음 빌드에서 실행할 테스트 결정 |
| `backend-deployed.sha` | DEV 백엔드 배포 스크립트가 성공한 직후 | 이후 누적 백엔드 변경 확인 |
| `frontend-deployed.sha` | DEV Vercel 배포 명령이 성공한 직후 | 이후 누적 프론트엔드 변경 확인 |

백엔드 배포가 성공하고 프론트엔드 배포가 실패해도 백엔드 SHA만 갱신한다. 다음 빌드는 프론트엔드 미배포 변경을 다시 찾아 배포한다. 테스트 실패 시 `tested.sha`가 전진하지 않아 다음 빌드에서 해당 테스트를 다시 실행한다. 경로 분류와 Compose 검사 등 필수 검사에 실패해도 기준 파일을 갱신하지 않는다. 같은 SHA의 재실행은 서비스별 배포가 이미 끝났으면 배포를 건너뛴다.

처음 적용하는 빌드에는 기존 `dev.sha`를 테스트 기준으로만 읽는다. 기존 파일은 갱신하지 않는다. 백엔드 배포 기준이 없다면 실행 중인 `wooaw/ontop-backend:sha-<전체 SHA>` 이미지의 SHA가 현재 `dev`의 조상인지 확인한 뒤 그 **실제 배포 SHA**를 자동 기록한다. 실행 이미지와 기록된 백엔드 SHA가 서로 다르면 백엔드 자동 배포를 중단한다. 프론트엔드 배포 기준은 Vercel의 실제 배포와 Git SHA를 대조할 수 없어 자동으로 추정하지 않는다. 한 서비스의 기준만 없으면 그 서비스의 자동 배포만 막고, 다른 서비스는 계속 배포할 수 있다. 기존 `reviewed-config.sha` 파일은 더 이상 읽지 않는다.

1. 병합 후 Jenkins 빌드 기록에서 필수 검사와 해당 서비스의 테스트 결과를 확인한다. `tested.sha`가 없거나 유효하지 않으면 두 서비스 테스트를 실행하고 배포를 보류한다. 배포 기준이 없는 서비스도 안전하게 보류한다.
2. Vercel `ontop-frontend-dev`의 **현재 `dev.on-top.world`를 제공하는 배포**가 어떤 Git 전체 SHA의 소스에서 만들어졌는지 빌드 기록과 배포 기록으로 확인한다. 확인할 수 없다면 프론트엔드 기준 SHA를 적지 않는다. 이 경우 검토한 `dev` 커밋을 로컬에 체크아웃해 **개발용 Vercel 프로젝트에만** 한 번 수동 배포한다. 프론트엔드 폴더에서 `vercel link`로 기존 `ontop-frontend-dev` 프로젝트를 선택하고 `.vercel/project.json`의 `projectId`가 서버의 `vercel-dev.env`에 있는 `VERCEL_PROJECT_ID`와 같은지 확인한 뒤 `vercel deploy --prod`를 실행한다. 배포 URL·동작을 확인한 후 **배포에 사용한 커밋 SHA**를 기준으로 기록한다. 운영용 `ontop-frontend` 프로젝트와 혼동하지 않는다.
3. 확인된 SHA를 Jenkins 서버의 해당 `dev` 작업 공간에서 Jenkins 계정으로 기록한다. 아래 명령의 `<검증한-전체-SHA>`만 교체한다. Git 저장소와 기준 파일에 접근할 수 있는 서버 관리자만 실행한다.

   ```bash
   cd /var/lib/jenkins/workspace/ontop-dev
   sudo -u jenkins python3 infra/ci/write_state.py --kind frontend --sha <검증한-전체-SHA> --state-dir /var/lib/jenkins/ontop-state
   ```

4. 유효한 기준이 있으면 GitLab의 `dev` 푸시 웹훅으로 자동 실행한다. `Jenkinsfile`, `infra/ci/`, `infra/app/` 변경은 필수 CI·Compose 검사를 통과해야 하며, 앱 변경이 함께 있으면 해당 서비스 테스트·배포도 계속 진행한다. `.gitignore`만 변경된 경우 앱 테스트·배포 대상에서 제외한다. 알 수 없는 공통 경로는 양쪽 서비스를 보수적으로 테스트·배포한다.
5. 마지막 배포 이후 누적된 서비스 변경만 자동 배포한다. 한쪽 기준이 없으면 그 서비스만 멈춘다. 기록된 백엔드 SHA와 실행 이미지가 다르면 백엔드 상태를 대조하고 바로잡는다. SHA를 현재 `HEAD`로 임의 지정해 미배포 변경을 건너뛰지 않는다.

모든 기준 SHA는 Git 커밋이며 현재 체크아웃의 조상이어야 한다. `write_state.py`가 이를 검사하고 파일을 원자적으로 기록한다. 배포 완료 여부는 Jenkins Stage View와 백엔드 실행 이미지, Vercel 배포 기록에서도 확인한다.

## 개발 중 테스트와 실행 시간

- 백엔드 수정 중에는 `cd backend && ./gradlew test --tests '패키지.테스트클래스'`로 관련 테스트를 먼저 실행한다. 프론트엔드는 `cd frontend && pnpm exec vitest run 테스트파일`을 사용한다. MR 병합 전에는 영향받은 서비스의 전체 검사(`./gradlew test` 또는 `pnpm test && pnpm build`)를 통과시킨다. 현재 Jenkins 작업은 `dev` 병합 뒤 웹훅으로 실행되므로 MR 전 검사는 작성자와 리뷰어가 확인한다.
- Jenkins는 마지막 테스트 성공 SHA 이후의 변경 경로로 백엔드·프론트 테스트 여부를 각각 결정한다. 공통 경로가 불명확하면 양쪽을 검사하고, CI·Compose 파일은 매 빌드 실행되는 필수 검사로 검증한다. 마지막 배포 성공 SHA는 서비스마다 따로 유지한다.
- 백엔드 `test`는 JVM 최대 힙 1 GiB, 병렬 fork 1개, Spring 컨텍스트 캐시 최대 8개로 실행한다. 2026-11-04 생성 맵 포함 전체 검사에서 발생한 `Java heap space`에 대응해, 캐시 기본값 32개 대신 오래된 컨텍스트와 내장 서버를 조기에 닫는다. 실행 시작 시 이 예산을 로그에 출력한다. Jenkins 컨트롤러나 운영 앱의 JVM 설정은 변경하지 않는다. 컨텍스트 재생성이 늘어 실행 시간이 길어질 수 있으므로 전체 검사 소요 시간도 함께 확인한다.
- 백엔드 테스트가 실행되면 `report_test_times.py`가 JUnit XML에서 테스트 수와 가장 오래 걸린 테스트 클래스를 Jenkins 로그에 출력한다. Gradle 전체 소요 시간도 함께 출력해 컴파일·준비 시간과 테스트 클래스 시간을 구분한다.
- 2026-10-28 Jenkins #119 기준 백엔드 Gradle 단계는 9분 33초, `:test` 시작부터 완료까지 약 8분 36초였다. DEV-CI는 2 vCPU·메모리 7.6 GiB이고 `.gradle` 약 329 MiB, pnpm store 약 158 MiB가 작업 사이에 유지된다. 컴파일·의존성 캐시보다 테스트 실행 시간이 큰 구간이다. 고정 포트·공유 상태를 쓰는 테스트의 병렬 안전성이 확인되기 전에는 전체 테스트의 병렬 fork 수를 늘리지 않는다.

운영 배포는 후속 전환·롤백 Story에서 승인된 이미지를 수동으로 승격한다. 운영 서버에서 다시 빌드하지 않는다. 배포 기록에는 Git 전체 SHA, `wooaw/ontop-backend:sha-<SHA>` 태그, Docker Hub 이미지 digest, 원본 Jenkins 빌드 URL, 실행 시각·담당자, 배포 전후 헬스 결과와 롤백 여부를 남긴다. 현재의 운영 이미지 태그는 `infra/app/README.md`에 기록된 수동 배포 버전이며, 이 CI Story가 운영 앱을 교체하지 않는다.

## 백엔드 이미지의 Gradle 다운로드 실패 대응 (2026-11-08)

`origin/dev@4b11db3abc9f2b25eec0d290ce15040e0e6a88e7`의 Jenkins 로그에서 백엔드 전체 테스트와 프론트엔드 테스트·빌드는 통과했지만, `backend/Dockerfile` 안의 새 Gradle 8.14.3 다운로드가 `Read timed out (10000ms)`으로 실패했다. 이후 백엔드·프론트엔드 개발 배포 단계는 건너뛰었으므로 테스트 성공을 배포 완료로 해석하지 않는다.

- `fix/ci-gradle-download-20261108`은 위 최신 dev를 기준으로 작업하며 기존 VR 변경을 포함한다. 시작 시 통합 충돌은 없었다.
- Wrapper의 `networkTimeout`을 10초에서 60초로 늘린다. Gradle 버전·공식 배포 URL·TLS 검증은 유지한다. 이 값은 네트워크 응답 대기 시간이며 전체 빌드 시간 제한을 해제하지 않는다.
- Docker 빌더의 `/root/.gradle`을 BuildKit 캐시 마운트로 유지한다. 소스가 바뀌어 빌드 레이어를 다시 실행해도 배포본·의존성을 재사용한다. `sharing=locked`로 동시 쓰기를 막으며 캐시는 최종 실행 이미지에 포함하지 않는다. 빌더 변경·캐시 정리 뒤에는 다시 다운로드할 수 있어야 한다.
- 첫 다운로드에서는 외부 일시 오류에도 대응하도록 `./gradlew --no-daemon --version`만 최대 3회, 실패 사이 5초 간격으로 실행한다. 세 번 모두 실패하면 이미지 빌드를 중단한다. 이어지는 `bootJar -x test`는 한 번 실행하며 컴파일 실패를 재시도로 숨기지 않는다.
- 로컬 Docker에서도 공식 배포 URL이 연결하는 GitHub에서 HTTP 504가 발생했다. 타사 미러나 TLS 검증 해제 대신 제한된 재시도와 캐시를 사용한다. 외부 서비스의 장기 장애까지 성공을 보장하지 않는다.

검증은 Jenkins와 같은 `linux/amd64` 이미지 빌드, 네트워크를 끄고 빌드 레이어를 다시 실행하는 캐시 검증, CI Python 테스트와 공원 전달본 검사로 진행한다. Jenkins 전체 파이프라인·Docker Hub 게시·개발 서버 배포는 MR 병합 뒤 해당 빌드 결과로 별도 확인한다. `tested.sha`와 서비스별 배포 성공 SHA를 임의 변경하거나 테스트 단계를 건너뛰지 않는다.

로컬 검증 기록:

- `docker build --platform linux/amd64 --progress plain --tag ontop-backend:ci-gradle-download-20261108 backend`: 이미지 생성 성공. 최종 이미지의 `app.jar`·실행 스크립트 존재와 실행 사용자 UID 10001을 확인했다.
- CI Python 테스트 62개 중 Windows에서 55개 통과, Linux root 전용 7개는 네트워크 없는 읽기 전용 Docker 컨테이너에서 별도로 모두 통과했다. `check_park_handoff.py`와 `git diff --check`도 통과했다.
- 다운로드 재검증에서 실제 HTTP 503 두 번 뒤 세 번째 시도가 성공했다. 네트워크를 끈 빈 캐시에서는 세 번 실패 후 이미지 생성을 중단하는 것도 확인했다.
- 캐시를 채운 뒤 검증용 Dockerfile을 표준 입력으로 전달하고 임시 `ARG CI_CACHE_PROBE` 값을 바꿔 빌드 레이어를 무효화했다. `--target build --network none`에서 배포본 다운로드 없이 컴파일·`bootJar`가 52초에 성공해 캐시 재사용을 확인했다. 검증용 ARG는 저장소 Dockerfile에 추가하지 않았다. `--no-cache`는 캐시 마운트도 비울 수 있어 재사용 검증에 사용하지 않는다.
- Jenkins 읽기 API는 HTTP 403으로 접근이 거절되어 새 Jenkins 실행 결과와 실제 개발 배포 완료 여부는 로컬 검증 범위에 포함하지 않는다.
- MR !455 병합 전 최신 `origin/dev@4b11db3a`를 다시 가져와 작업 브랜치에 포함된 것을 확인했다. `git merge-tree --write-tree origin/dev HEAD`와 변경 범위 검사에 충돌이 없었고, CI 테스트 62개(Windows 55개·Linux 7개), 공원 전달본 검사, Docker 이미지 빌드를 재확인했다. 애플리케이션·빌드 설정은 검증한 `e152d908`과 동일하다. Jenkins 성공 확인 전에는 작업 브랜치를 삭제하지 않는다.

참고: [Gradle Wrapper 네트워크 설정](https://docs.gradle.org/current/dsl/org.gradle.api.tasks.wrapper.Wrapper.html), [Docker 캐시 마운트](https://docs.docker.com/build/cache/optimize/).

## 오목 관전 테스트의 타이머·Spy 설정 경합 (2026-11-08)

`origin/dev@afffc5f0fc9ccd29bb54fbbd94d8bb34cde5f9aa`의 Jenkins는 백엔드 테스트 3,514개 중 `OmokSpectatorEventFlowTests`의 준비 단계에서 `UnfinishedStubbingException`이 발생해 실패했다. Docker 이미지 생성과 개발 배포에는 도달하지 않았다. 이 로그로 MR !455의 다운로드 보완이 실패했다고 판정할 수는 없다.

이 테스트는 `@BeforeEach`에서 Spy 엔진의 `createWithCoinToss`를 설정하지만 실제 `omokTimer`가 200ms마다 같은 엔진을 호출한다. 타이머 호출이 설정 중인 Mockito stubbing을 소비할 수 있다. 기존 `CommittedStartFlowTests`와 동일하게 **해당 관전 테스트에서만** `omokTimer`를 대역으로 교체하고, 30초 시간패 검증은 테스트 시계를 전진한 뒤 `engine.tick()`으로 명시적으로 진행한다. 실제 스케줄러를 사용하는 `OmokFlowTests`의 시간패·종료 방송 검증은 유지한다.

작업 브랜치는 `fix/omok-spectator-stubbing-20261108`이며 위 최신 dev에서 분기했다. 변경은 오목 관전 테스트와 이 CI 문서로 한정한다. 실제 엔진·타이머·FE/BE 통신 계약·DB·Flyway 및 Jenkins 검사 조건은 변경하지 않는다. 생성 맵 전달본을 준비한 관련 오목 테스트와 백엔드 전체 테스트로 검증하고, Jenkins 재빌드·배포 결과는 병합 후 별도로 확인한다.

로컬 검증 기록:

- 수정 전 관전 테스트 5개는 단독 실행에서 통과했다. Jenkins의 간헐 실패가 로컬에서 항상 재현되는 것으로 기록하지 않는다.
- Windows·Java 21에서 관전 테스트, 실제 타이머를 사용하는 `OmokFlowTests`, 확정 시작 테스트, 오목 규칙·엔진 테스트 9개 클래스·110개가 모두 통과했다. 실행 명령은 `gradlew.bat --no-daemon test --tests 'com.ssafy.ontop.table.OmokSpectatorEventFlowTests' --tests 'com.ssafy.ontop.table.OmokFlowTests' --tests 'com.ssafy.ontop.table.CommittedStartFlowTests' --tests 'com.ssafy.ontop.game.omok.*'`이며 `TEST_GENERATED_MAP_DIR`에 최신 전달본을 준비했다.
- Linux/amd64·Temurin Java 21.0.13에서 백엔드 전체 `test`가 18분 3초에 성공했다. JUnit XML 집계는 435개 클래스·3,514개 테스트, 실패 0·오류 0·기존 조건부 건너뜀 11개다. 수정한 관전 테스트 5개는 모두 실행·통과했다. 검증용 컨테이너에 실제 루트 문서, FE 생성 맵·점프맵 전달본·공통 fixture·필요한 스킨 에셋을 포함했다. 진행 로그용 Gradle init script와 Dockerfile은 로컬 `backend/build/ci-omok-stubbing/`에만 두었다.
- `check_park_handoff.py --verify-results`로 생성 맵 관련 6개 클래스가 건너뜀·실패 없이 실행된 것을 확인했다. 실제 Jenkins의 전체 검사 재현 명령은 기존 `bash infra/ci/run-generated-map-tests.sh full`이다.
- 커밋 전 최신 원격을 다시 확인했으며 dev 기준은 `afffc5f0`로 동일하다. 통합 충돌과 `git diff --check` 오류는 없다. 실제 게임 코드·프론트엔드·Docker/Gradle 빌드 설정은 기준 dev와 동일하다.
- Jenkins API는 HTTP 403이어서 서버 재빌드·이미지 게시·개발 배포 성공은 확인하지 못했다. 이번 MR은 머지를 보류하고 Jenkins 성공 확인 전까지 작업 브랜치를 유지한다.

## 실행 권한과 위험

Jenkins 서비스 계정은 2026-10-23 사용자의 명시적 승인 후 Docker 그룹에 가입했고, `/usr/local/sbin/ontop-deploy-dev` 실행에만 비밀번호 없는 `sudo`를 허용했다. Jenkins 계정의 Docker API 접속 성공, 배포 스크립트의 잘못된 SHA 거부, 다른 `sudo` 명령 거부를 확인했다. Docker 그룹 자체는 호스트 root와 사실상 동등한 권한이므로 Jenkins 관리자·저장소의 `dev` 브랜치 쓰기 권한·Credentials 접근을 제한해야 한다. Jenkins 웹 관리 화면은 외부에 공개하지 않고 SSH 터널로만 연다.
