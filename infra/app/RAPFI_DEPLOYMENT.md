# Rapfi 컨테이너 연결

대상은 공식 Rapfi 250615 Linux x86_64 배포다. 엔진·가중치는 Git에 넣지 않고
서버의 `/opt/ontop/rapfi/250615`에 설치한 뒤 백엔드에 읽기 전용으로 연결한다.
GPU·외부 API 키·별도 포트는 필요 없다. 현재 어댑터는 요청마다 프로세스를 실행하며
검색 300ms, 스레드 1개, hash 16MiB를 지정한다. 실제 전체 프로세스 메모리나 응답 시간의 상한을 뜻하지 않는다.

## 사전 조건

- shell·sudo·Docker 권한이 있는 설치 계정. 포트 포워딩만 허용된 계정으로는 설치할 수 없다.
- **`libatomic1`을 포함한 새 백엔드 이미지**. 기존 이미지에 경로만 설정하면
  `libatomic.so.1` 누락으로 실행에 실패할 수 있다. 해당 패키지는 `backend/Dockerfile`에 추가했다.
- 현재 app.env의 `AI_ENABLED=true`, `AI_RESIDENTS_ENABLED=true` 유지.
  Jev·OpenAI·MM·DB 비밀값은 조회하거나 교체할 필요 없다.

## 파일 준비와 설치

공식 릴리스: https://github.com/dotb1ue/rapfi/releases/tag/250615

`Rapfi-engine.7z`의 확인된 SHA256:
`1a3e24024062a153ac079060ee9589a37c6bdd1ecc54fed3908793c519594e05`.
압축을 푼 배포 디렉토리를 서버에 복사한다. 저장소의 `rapfi-250615.sha256`은
설치하는 Linux 바이너리·모델·설정·저자 파일 각각의 바이트를 고정한다.

```bash
sudo bash /opt/ontop/infra/app/stage-rapfi.sh /tmp/rapfi-250615
```

스크립트는 체크섬을 확인하고 CPU에 따라 AVX2 또는 SSE를 선택해 `rapfi` 이름으로 설치한다.
디렉토리·실행 파일은 root 소유 0755, 설정·가중치는 0644다. 기존 설치의 바이트가
다르면 덮어쓰지 않는다. 앱은 설정과 가중치를 같은 작업 디렉토리에서 읽는다.
설치만으로 앱 재시작·DB 변경·환경변수 변경은 일어나지 않는다.

## DEV 활성화

검증한 새 이미지와 설치 파일을 준비한 뒤 현재 배포 설정에 **아래 값만 추가**한다.

```dotenv
# /etc/ontop/dev-app/deploy.env (app.env가 아님)
RAPFI_HOST_DIR=/opt/ontop/rapfi/250615
```

`compose.rapfi.yaml`과 변경된 `deploy-dev.sh`를 서버 배포 경로에 반영한다.
현재 `ontop-deploy-dev`가 사용하는 실제 스크립트도 확인해서 갱신한다.
`sudo install -m 0644 /dev/null /etc/ontop/dev-app/rapfi.enabled`로 활성 표시를 만든다.
이후 기존 정상 배포 절차로 **새 이미지 SHA**를 배포하면 Jenkins의 후속 재배포에도
Rapfi 오버레이가 유지된다. 같은 이미지 SHA로 배포하면 기존 스크립트가 재생성을
생략하므로 최초 연결은 새 이미지 배포와 함께 진행한다. 다른 맵·모니터링·꼬치왕
오버레이를 빼고 Compose를 따로 실행하지 않는다.

오버레이는 컨테이너에 `AI_RAPFI_PATH=/run/ontop/rapfi/rapfi`를 지정한다.
호스트 경로나 Windows `.exe`를 app.env의 실행 경로로 지정하면 안 된다.

## 운영 활성화

운영 서버에도 같은 파일을 설치하고 운영 deploy.env에 같은 `RAPFI_HOST_DIR`을 추가한다.
운영 배포에서 사용하던 **모든 기존 Compose 파일을 유지한 채**
`-f /opt/ontop/infra/app/compose.rapfi.yaml`을 추가한다.
현재 저장소의 자동 배포 스크립트는 DEV용이므로 운영 자동 배포에 연결됐다고 가정하지 않는다.
운영 배포 담당자가 재시작 시점과 실제 배포 명령에 이 파일이 유지되는지 확인한다.

## 검증 및 복구

```bash
bash /opt/ontop/infra/app/verify-rapfi.sh ontop-dev-app-app-1
# 운영은 실제 백엔드 컨테이너 이름을 지정한다.
```

실제 백엔드의 비루트 사용자로 렌주 300ms 분석 한 번을 실행해 모델 로딩·평가·착수를 확인한다.
공유 DB·채팅·MM·LLM 호출은 하지 않는다. 그 다음 인게임에서 보통/어려움 NPC 착수와
`companions/status`의 `engine=RAPFI`, 실제 `analysis.source=RAPFI` 또는
`RAPFI_TACTICAL`을 확인한다. `engine` 값만으로 실행 성공을 판정하지 않는다.

되돌릴 때 DEV는 `rapfi.enabled`를 제거하고 기존 배포 도구로 백엔드를 재생성한다.
같은 이미지 SHA는 재생성을 생략하므로 담당자가 기존 오버레이를 유지하는 정상 재생성
절차를 사용해야 한다. 운영은 Rapfi 오버레이만 제외하고 동일하게 재생성한다.
app.env에 별도로 `AI_RAPFI_PATH`를 설정했다면 비워 로컬 전술 로직으로 복귀한다.
엔진 파일·DB·기존 환경변수를 삭제하거나 초기화하지 않는다.

Rapfi는 GPLv3다. 배포물·가중치를 외부에 재배포할 때에는 공식 소스와 라이선스 및
각 가중치의 조건을 확인한다. 이 문서는 공개 재배포 허가를 대신하지 않는다.
