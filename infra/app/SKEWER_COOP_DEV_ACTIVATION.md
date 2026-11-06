# DEV 꼬치왕 방 생성 점검·활성화

## 확인된 범위

2026-11-06 DEV 브라우저에서 방 목록 조회와 방 생성 실패를 재현했다. 아직 HTTP 상태·응답 코드와
실제 컨테이너 환경/공유 DB는 확인하지 못했다. 아래는 **설정 누락 후보에 대한 절차**이며
운영 서버를 이미 수정했다는 기록이 아니다.

- 협동 REST/엔진은 `ontop.games.skewer-coop.enabled=true`일 때만 등록된다.
- `skewer-coop` 프로필이 이를 활성화하고 영속 저널 경로를 요구한다.
- 기본 DEV Compose는 `dev,db`만 사용한다. 별도 app.env 설정 여부는 서버에서 확인해야 한다.
- 기존 배포 실행기는 협동 override를 선택하지 않았다. 이제 deploy.env에 영속 디렉터리를
  명시하면 generated-map override 뒤에 협동 override도 계속 적용한다. 기본 배포는 그대로다.
- 저장소 파일은 서버에 자동 설치되지 않는다. 아래 작업은 인프라 담당자가 한다.

## 1. 실제 실패 원인과 DB 확인 (읽기 전용)

로그인한 브라우저의 Network에서 `/api/v1/minigames/skewer/coop/rooms`의 GET/POST 상태와
응답 `code`, `message`만 확인한다. 토큰/쿠키는 공유하지 않는다.

| 응답 | 확인할 내용 |
| --- | --- |
| 404 | 백엔드 이미지·협동 활성화 프로필·API 전달 경로 |
| 503 / `SKEWER_COOP_STORAGE_UNAVAILABLE` | 회원/프로필 DB 조회 및 DB 접근 로그 |
| 403 / 진입 거절 | 정상 공원 WS, 같은 채널, 최신 맵·VR 입구 위치·진행 중 활동 |
| 409 / `SKEWER_COOP_REJECTED` | 응답 메시지와 서버 로그로 구체적 조건 확인 |

서버의 승인된 체크아웃에서 다음 읽기 전용 검사로 V145 이력과 두 테이블을 확인한다.
기존 Compose project/설정 파일 경로는 유지한다.

```bash
cd /opt/ontop
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env \
  -f infra/app/compose.dev.yaml exec -T mysql sh -s -- ontop_dev \
  < infra/app/verify-skewer-coop-db.sh
```

`145 / V145__create_skewer_coop_results.sql / success=1`과 `skewer_coop_table_count=2`를 확인한다.
다른 V145 또는 일부 테이블만 있으면 중단한다. DB가 V145보다 앞서 있으면 기존 합의된
migration locations로 순차 적용 계획을 검토한다. **최신 DB가 이미 V145를 지났는데 V145가
없다면 단순히 locations만 추가하면 안 된다.** 기존 이력/SQL은 보존하고 신규 보완 migration이
필요한지 검토한 뒤 팀과 새 V번호를 조율한다. 임의 `outOfOrder`, `repair`, `baseline`, 초기화는 하지 않는다.
이번 수정은 migration을 생성하거나 기존 V145를 변경하지 않는다.

## 2. 영속 폴더·배포 실행기 준비 (DB 확인 후)

- `/opt/ontop/infra/app/compose.skewer-coop.yaml`을 승인된 커밋의 파일로 설치한다.
- `/usr/local/sbin/ontop-deploy-dev`를 승인된 `infra/ci/deploy-dev.sh`로 갱신한다.
  기존 파일을 백업하고 root 소유·기존 실행 권한을 유지한다. Git 머지만으로 설치되지 않는다.
- 인스턴스 전용 빈 디렉터리를 준비한다. 기존 저널 폴더가 있다면 지우거나 공유하지 않는다.

```bash
sudo install -d -o 10001 -g 10001 -m 0700 /var/lib/ontop/skewer-coop/dev
```

`/etc/ontop/dev-app/deploy.env`에 아래 한 줄을 추가한다(기존 이미지·맵·DB 설정 보존).
단순 절대 경로로 쓰고 따옴표/인라인 주석을 붙이지 않는다.

```dotenv
SKEWER_COOP_JOURNAL_HOST_DIR=/var/lib/ontop/skewer-coop/dev
```

공유 DB/기존 프로필·migration locations는 확인한 실제 값을 유지한다. 협동 override는
`SPRING_PROFILES_INCLUDE=skewer-coop`을 추가하므로 기존 include가 있다면 먼저 함께 보존하도록
조율한다. 저널을 `/tmp`에 두거나 read-only 앱 파일시스템을 쓰기 가능으로 풀지 않는다.

## 3. 첫 적용과 다음 배포

최초 설정 적용은 현재 승인된 이미지에서 앱만 재생성한다. **같은 SHA의 배포 실행기는
기존대로 건너뛰므로 재실행만으로 설정이 적용되지는 않는다.**

```bash
cd /opt/ontop
# 현재 generated 맵을 사용하는 DEV 기준: park-map.enabled와 맵 경로의 일치를 먼저 확인한다.
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env \
  -f infra/app/compose.dev.yaml -f infra/app/compose.generated-map.yaml \
  -f infra/app/compose.skewer-coop.yaml config --quiet
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env \
  -f infra/app/compose.dev.yaml -f infra/app/compose.generated-map.yaml \
  -f infra/app/compose.skewer-coop.yaml up -d --no-deps --force-recreate app
```

정상 헬스·활성 프로필·영속 마운트·서버 시작 로그를 확인한다. 전체 `docker compose config`나
`printenv`는 비밀 값을 노출할 수 있으므로 로그에 남기지 않는다. 이후 새 SHA 배포는 갱신한 실행기가
같은 override를 유지한다. 첫 활성화의 롤백은 이전 이미지뿐 아니라 백업한 Compose 설정으로
앱을 재생성해야 한다. DB 이력·생성된 저널 파일은 보존한다.

정상 계정 두 개로 목록 조회 → 방 생성 → 친구 참가 → 역할 선택 → 대기 방 나가기를 확인한다.
그 후 경기 종료·보상 확정·재접속 검수를 진행한다. 헬스 UP만으로 방 생성 성공이라 보고하지 않는다.

## 로컬 검사

`infra/ci/test_deploy_dev_skewer.py`는 격리된 Linux 컨테이너에서 배포 실행기 원본을 복사해
외부 명령을 stub으로 바꿔 검사한다. 서버·Docker 소켓·실제 DB에는 연결하지 않는다.
기본 비활성, generated 맵과 협동 override 동시 유지, 경로 누락·권한 오류 시 이미지 변경 전 차단을 확인한다.
