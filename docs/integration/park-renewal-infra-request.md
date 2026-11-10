# 새 공원 dev 전환 요청 — 2026-11-10

아래 내용을 인프라 담당자에게 전달한다. MR 검토 요청이며 실제 머지·배포는 별도 승인 후 진행한다.

## 전달용 요청문

새 공원 맵과 10단계 점프맵을 dev에 올리기 위한 FE·BE·배포 설정을 MR로 준비했습니다.
기존 dev Vercel 프로젝트와 dev API를 사용합니다. 새 서버나 새 Vercel 프로젝트 생성은 필요하지 않습니다.
최초 공동 전환 전에는 `renewal-candidate`로 검사하고 `renewal-deploy`로 승인 배포합니다.
전환 완료 후 Jenkins 기본값은 변경 서비스만 검사·자동 배포하는 `legacy`이며,
새 맵 계약 파일 변경은 자동으로 차단되어 다시 공동 전환을 요구합니다.

아래 항목을 확인하고 공동 전환을 준비 부탁드립니다.

1. **검수용 Jenkins 실행:** 작업 브랜치를 대상으로 `Jenkinsfile.park-renewal`을 사용하는 후보 검수 job을
   연결해 주세요. 이 파일은 이미지 publish·서비스 전환·Vercel 배포를 하지 않습니다.
   Node 24, pnpm 11.25.0, Java 21, Python 3와 Docker가 필요합니다.
   최종 전체 SHA와 해당 빌드 URL·결과를 공유해 주세요.
2. **V167 확인:** 실제 dev DB의 Flyway 이력과 팀 예약에서
   `db/minigame/V167__extend_jumpmap_to_ten_stages.sql`의 충돌·적용 여부를 확인해 주세요.
   SHA-256은 `33680d3ed62f762862a31c9a19d388604f26e758f2868ae06a31f0df30dbe15a`입니다.
   10단계 허용 CHECK만 확장하며 기존 기록·보상 원장은 유지합니다.
   이미 적용된 migration 수정, 임의 repair, DB 초기화는 하지 말아 주세요.
3. **서버 helper 설치:** 검토 완료된 같은 커밋의 `infra/ci`, `infra/app` 파일과
   `frontend/park-renewal-baseline.json`을 `/opt/ontop` 대응 경로에 설치해 주세요.
   `deploy-park-renewal.sh`는 `/usr/local/sbin/ontop-deploy-park-renewal`에 설치하고,
   기존 정책에 맞춰 Jenkins가 `--check/--apply/--update SHA RELEASE_ID`를 실행할 수 있도록 준비해 주세요.
   상세 의존 파일·검사는 [공동 릴리스 가이드](park-renewal-release.md)를 따라 주세요.
4. **별도 전환 환경 설정:** 기존 `deploy.env`를 바탕으로
   `/etc/ontop/dev-app/park-renewal.deploy.env`를 root:root, 0600으로 준비해 주세요.
   예제 파일은 추가 키만 담고 있습니다. 기존 app.env·DB secret·게임 활성화 플래그·OAuth·TLS·Nginx를 보존하고,
   기존 협동 꼬치왕 journal 경로·내용과 UID/GID 10001:10001, 권한 0700을 유지해 주세요.
   Vercel은 기존 `vercel-ontop-token`과 `vercel-dev.env`의 dev 프로젝트 ID를 사용합니다.
5. **같은 소스의 FE·BE·맵 사용:** 승인된 최종 커밋에서 함께 다시 빌드하고,
   `stage-park-renewal.sh <확정소스루트>`로 `/opt/ontop/park-renewal/<releaseId>`를 준비해 주세요.
   `BACKEND_IMAGE=wooaw/ontop-backend:sha-<전체SHA>`와 동일 SHA/releaseId를 설정하고,
   새 맵을 읽기 전용으로 mount해 주세요. `compose.generated-map.yaml`은 새 overlay와 함께 사용하지 않습니다.
6. **승인 후 공동 전환:** 진행 중인 게임 종료·정산, DB 백업·롤백 호환성 확인, 신규 입장 제한과 WS 정리 후
   `renewal-deploy`를 실행해 주세요. Jenkins 승인 확인 후 **BE → health·실제 맵 파일 일치 검사 → FE** 순서로 전환합니다.
   Flyway 시작 적용을 쓰는 경우 V167 수동 SQL을 중복 실행하지 않습니다.
7. **dev 확인 후 입장 재개:** `dev.on-top.world` 공개 manifest의 SHA/releaseId 일치,
   정문 스폰, 착석→게임→정산→공원 복귀, 점프맵 10단계·총 250냥·중복 지급 방지,
   공사중 안내, OAuth·HTTP·WS를 확인하고 입장을 재개해 주세요.
   실패 시 입장을 계속 제한하고 FE·BE·맵을 함께 복구해 주세요. 적용된 V167은 그대로 보존합니다.

좌표/world 230개, 공사중 시설 16개, 기존 테이블 UUID와 회원·상품·지갑 데이터는 보존 대상입니다.
로컬 QA 계정이나 fixture DB를 dev에 복사하지 않습니다.

현재 로컬의 Jenkins SSH 터널(`localhost:8081`)은 연결 거부 상태여서 실제 Jenkins 결과를 확인하지 못했습니다.
MR 생성·로컬 검수 완료와 실제 Jenkins 성공·배포 완료는 구분해 주세요.

## 참고 문서

- [MR 검수 기록](park-renewal-mr-readiness.md)
- [FE·BE 공동 릴리스 상세 절차](park-renewal-release.md)
- [배포 환경 추가 키 예제](../../infra/app/park-renewal.deploy.env.example)
