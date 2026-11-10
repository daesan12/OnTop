# 새 공원 FE·BE 공동 릴리스

이 문서는 새 공원 공동 전환 가이드다. 최신 작업/검수 상태는 [MR 전 검수 기록](park-renewal-mr-readiness.md)을 따른다.
좌표/world 230개, 공사중 시설 16개, V167 원본을 보존한다. 최종 승인된 **깨끗한 커밋에서 다시 빌드**해야 한다.
로컬 산출물의 sourceCommit은 작업 기준 커밋이며, 미커밋 변경까지 반영한 확정 배포 커밋이라는 뜻이 아니다.

## 준비한 전환 설정

- 최초 공동 전환이 끝난 뒤 `Jenkinsfile`의 `PARK_RELEASE_MODE` 기본값은 `legacy`다. 이름은 호환을 위해 유지하지만,
  새 공원이 활성화된 DEV에서는 변경된 서비스만 검사하고 **현재 immutable 새 맵을 보존한 채** 자동 배포한다.
- `renewal-candidate`는 맵·좌표·승인 에셋 변경의 FE·BE 검사와 산출물 보관만 수행하며 이미지 push·서비스 전환·FE 배포를 실행하지 않는다.
- `renewal-deploy`는 같은 소스 전체를 다시 검사하고, clean checkout·서버 사전 검사·Jenkins 명시 승인을 통과해야 배포한다.
- 기본 모드는 새 공원 활성 marker를 감지하면 `deploy-park-renewal.sh --update`와
  `vercel.renewal-active.json`을 사용한다. 실행 이미지·UI만 교체하고 releaseId·읽기 전용 map mount·프로필을 유지한다.
  맵 계약 경로가 바뀌면 자동 배포를 차단하고 `renewal-candidate → renewal-deploy`를 요구한다.
- `Jenkinsfile.park-renewal`은 dev 이외의 후보 작업에서도 사용할 수 있는 빌드·검사 전용 파이프라인이다. publish 단계가 없다.
- `frontend/vercel.renewal.json`은 **기존 dev Vercel 프로젝트**의 새 공원 설정이다. API·인증·관리자 경로를 보존한다.
  `frontend/vercel.renewal-active.json`은 이미 전환된 새 공원에서 일반 UI 변경을 배포할 때 현재 공개 맵 계약을 재사용한다.
  운영 프로젝트의 `vercel.json`, 기존 `vercel.dev.json`은 변경하지 않는다. CLI의 명시적 `--local-config`로 선택한다.
- Vercel은 `pull → build --prod → 산출물 검사 → BE 일치 검사 → deploy --prebuilt --prod → dev 공개 manifest 검사` 순서다.
  `.vercel` 안의 환경 파일·프로젝트 설정과 토큰은 보관 산출물에 포함하지 않는다.
  [공식 build 문서](https://vercel.com/docs/cli/build), [공식 prebuilt deploy 문서](https://vercel.com/docs/cli/deploy).
- `compose.park-renewal.yaml`은 읽기 전용 맵 마운트와 소스/릴리스 label을 적용한다.
  기존 협동 꼬치왕 journal은 `compose.skewer-coop.yaml`로 유지한다. 모니터링이 활성화되어 있으면
  `compose.park-renewal-observe.yaml`을 마지막에 넣어 새 맵 프로필이 덮이지 않도록 한다.

## 재현 가능한 빌드와 검수

Node 24, pnpm 11.25.0, Java 21, MySQL 8.4를 사용한다.
`frontend`에서 `pnpm install --frozen-lockfile` 후 `pnpm run build:park-renewal:release`를 실행한다.
이 명령은 승인 에셋 해시 확인, 구 공원 handoff 생성, 새 공원 매핑/BE/공동 릴리스 생성, 타입 검사, FE 빌드를 수행한다.
`frontend/generated/park-renewal/`은 모두 재생성 가능한 무시 경로다. 생성물을 Git에 넣어 커밋 해시와 맵 버전이 순환하지 않도록 한다.
일반 build·typecheck·test도 필요한 프론트 데이터를 먼저 생성한다.

- FE 산출물: `frontend/dist-park-renewal/`.
- 승인 에셋: `frontend/src/park-renewal/approved/`, `frontend/public/art/park-renewal/`, `park-renewal-assets.lock.json`.
  `/@fs/`나 다른 PC의 외부 에셋 디렉터리는 필요 없다.
- BE: `backend`에서 `bash ./gradlew --no-daemon test bootJar`, 기존 Dockerfile로 이미지 빌드.
  운영 bootJar는 demo/test 로그인 클래스와 local·park-renewal-local·frontend-test·visual-test 프로필을 제외한다.
  해당 프로필은 로컬 실행/테스트 classpath에는 남는다.
- 검사: 루트에서 `python3 -m unittest discover -s infra/ci -p 'test_*.py'`,
  `python3 infra/ci/check_park_renewal.py --source-sha <40자리SHA> --dist frontend/dist-park-renewal --jar <bootJar>`.
- 실제 배포 직전 위 검사에 `--require-clean`을 추가한다. 미커밋 후보를 배포할 수 없도록 거절한다.
- BE 검수: `check_live_renewal.py`로 실행 이미지·label·프로필·읽기 전용 마운트와 **6개 파일의 실제 내용**을 검사한다.
  `--public-url https://dev.on-top.world`는 공개 FE manifest까지 검사하며 운영 도메인은 허용하지 않는다.

## 동일한 맵 묶음

빌드는 좌표/world 기준 해시와 V167 원본 해시를 확인하고
`frontend/generated/park-renewal/releases/<releaseId>/`에 다음 파일을 생성한다.

- `release.json`: 소스 커밋·맵/좌표/에셋/V167 해시와 전체 파일 해시.
- `server-map.local.json`, `server-manifest.local.json`: BE 물리와 상호작용 좌표.
- `course.local.json`, `course.local.sha256`: 178개 발판 충돌체, 10단계와 증가하는 총 250냥 보상.
- `park-bindings.local.json`: FE 테이블 UUID·채널. 미배치 ID는 비활성 상태로 보존한다.

`park-renewal-local`과 `.local.json`은 검수한 프로토콜 식별자/파일명이다. 실제 배포도 동일하게 사용한다.
맵 버전은 소스 커밋을 포함하므로 최종 커밋·통합 후 같은 소스에서 FE·BE와 맵 묶음을 다시 빌드한다.
좌표 기준 SHA-256: `2278a379d3a906ecafcb8c048b0beb5ce07204146aa92c12cd49ac5b5922e57b`.
V167 SHA-256: `33680d3ed62f762862a31c9a19d388604f26e758f2868ae06a31f0df30dbe15a`.

## 인프라 담당자에게 전달할 실행 순서

아래는 **승인 후** 실행할 절차이며 이번 로컬 준비에서는 실행하지 않는다.

1. 최신 dev와 충돌·중복 변경을 확인하고 최종 소스 커밋을 확정한다.
   맵 계약 변경 건은 수동으로 `renewal-candidate`를 선택해 검사·아카이브를 완료하고 공동 releaseId를 기록한다.
2. 실제 dev DB Flyway 이력·열린 MR·팀 예약에서 **V167 충돌/checksum**을 확인한다.
   파일은 `backend/src/main/resources/db/minigame/V167__extend_jumpmap_to_ten_stages.sql` 하나다.
   CHECK를 10단계까지 확장하며 기존 rows·지급 원장·유일성을 보존한다. 이미 적용된 파일은 수정/삭제/번호 변경하지 않는다.
3. root 담당자가 검토한 같은 커밋의 `infra/ci` helper·검사 모듈, `infra/app` Compose와
   `frontend/park-renewal-baseline.json`을 `/opt/ontop`의 대응 위치에 설치한다.
   `deploy-park-renewal.sh`를 `/usr/local/sbin/ontop-deploy-park-renewal`로 설치하고 기존 정책에 따라
   Jenkins의 이 helper `--check/--apply SHA RELEASE_ID` 실행 권한을 준비한다. Git checkout의 임의 helper를 sudo 실행하지 않는다.
4. `stage-park-renewal.sh <확정소스루트>`로 `/opt/ontop/park-renewal/<releaseId>`를 준비한다.
   기존 파일이 다르면 거절하며 이 명령만으로 서비스·DB가 전환되지는 않는다.
5. 기존 `/etc/ontop/dev-app/deploy.env`를 바탕으로 **별도** `park-renewal.deploy.env`를 root:root 0600으로 준비한다.
   예제는 새 키만 담은 overlay다. 기존 app.env·DB secret 경로·인증·TLS·Nginx 설정을 보존한다.
   `BACKEND_IMAGE=wooaw/ontop-backend:sha-<SHA>`, 동일 SHA/releaseId와 immutable 경로를 지정한다.
   협동 journal은 기존 경로·내용을 보존하고 UID/GID 10001:10001, 권한 0700을 확인한다.
   새 Compose에는 `compose.generated-map.yaml`을 함께 넣지 않는다.
6. 기존 게임을 종료/정산하고 DB 백업·복구 및 구 앱의 V167 호환성을 확인한 뒤 신규 입장을 제한한다.
   살아 있는 WS 세션도 정리한다. 입장 제한/재개는 인프라 운영 절차이며 이 pipeline이 자동으로 수행하지 않는다.
7. **같은 커밋**을 `renewal-deploy`로 실행한다. clean checkout과 root helper 사전 검사 후 Jenkins 승인 창에서
   V167/백업/정산/입장제한/롤백 준비를 확인한다. Vercel 설정을 받아 prebuilt FE를 만들고 검사한다.
8. 같은 SHA의 BE 이미지를 빌드·publish하고 root helper가 BE만 전환한다.
   기존 Flyway 시작 적용을 사용한다면 V167 수동 SQL을 중복 실행하지 않는다.
   BE health와 실제 mount 내용·map/course identity를 검증한 뒤에만 FE prebuilt를 배포한다.
9. dev 공개 manifest 일치를 확인한 뒤 정문 스폰, 착석→게임→정산→복귀, 점프맵 250냥/중복 방지,
   공사중 E UI, OAuth·HTTP·WS를 검수하고 수동으로 입장을 재개한다.

기존 게임 활성화 설정(`GAME_*`, ledger), `SHOP_ENABLED`, `GACHA_ENABLED`, `RAFFLE_ENABLED`,
협동 꼬치왕 프로필·journal을 보존한다. 새 맵 프로필만으로 모든 게임 플래그가 켜지지는 않는다.
실제 dev 뽑기 카탈로그·재고·상품 이미지/복권 설정도 보존한다. 로컬 QA fixture를 dev DB로 이관하지 않는다.

## 실패와 롤백

최초 공동 전환의 BE 검증에 실패하면 FE는 배포하지 않는다. FE 배포/공개 manifest 검사에 실패해도 신규 입장을 재개하지 않는다.
helper는 root 전용 상태 기록과 기존 이미지/배포 설정/marker를 보관한다. 비밀 환경 파일은 Jenkins 아카이브에 넣지 않는다.
최초 공동 전환은 V167이 적용되었을 수 있으므로 자동으로 구 이미지로 되돌리지 않는다. 반면 전환 후의 일반 코드 이미지 update는
맵 계약을 유지한 채 실패 시 직전 이미지로 자동 복구한다. 공동 전환 실패는 검증한 이전 FE·BE·맵 산출물과
DB 호환성 계획을 바탕으로 함께 복귀하고, 적용된 V167은 그대로 보존한다.
새 공원 marker를 임의로 지워 기존 자동 배포를 재개하지 않는다.

## 전달 묶음과 검수 범위

`package_renewal_candidate.py --output <저장소밖경로> --jar <bootJar>`는 변경 소스 ZIP, 실행 산출물 ZIP과
파일별 SHA-256 목록을 만든다. Git stage/commit/push나 서비스 변경은 없다.
이 묶음은 미커밋 내용을 검토하는 **배포 후보**이며 최종 커밋으로 재빌드하기 전에는 배포 확정본이 아니다.
환경 파일·토큰·로컬 DB·node_modules·테스트 로그인 서버를 실행 묶음에 포함하지 않는다.

로컬에서는 shell/Compose/Groovy 문법, Python 배포/검사 모듈, 격리된 가짜 Docker·Vercel 명령 흐름,
FE 빌드·BE JAR/이미지와 실제 로컬 BE의 동일 맵 사용을 확인한다.
가짜 명령 흐름 검사는 실제 Jenkins 플러그인 실행·Vercel Build Output 생성/배포 검수와 구분한다.
외부 소셜 로그인, 실제 Jenkins/Vercel 권한·서버 root 설치, 40명 동접/실기기 VR는 이번 로컬 검수에 포함하지 않는다.

## 사용자 공개용 패치노트 완료 조건 (2026-11-10 사용자 요청)

맵 작업 완료 시 최종 dev 비교와 변경 전후 스크린샷을 포함해 바로 공개할 수 있는
게임 패치노트를 함께 제공한다. 현재 초안은 공개 확정본이 아니다.

- [ ] 사용자 추가 지정: 최종 이미지는 **1200×675px, 16:9 PNG 카드**로 제작한다.
  [제공된 새 소식 팝업 참고 이미지](patch-notes/user-news-popup-reference.png)의 한지 바탕,
  짙은 녹색·황토/금색, 전통 테두리, 큰 제목과 대표 이미지 중심 구성을 따른다.
  1200×675는 패치노트 카드 자체 규격이며 전체 게임 화면과 팝업 UI를 이미지에 다시 넣는 뜻은 아니다.
  팝업에 순서대로 보여줄 수 있도록 표지·주요 공간의 전후 비교·점프맵·이용 안내를 여러 장으로
  나누고 장수는 최종 내용에 맞춘다. 한 장에 설명을 몰아넣지 않고 실제 표시 크기의 가독성을 검수한다.
  예시 속 알까기 문구·그림은 참고용이며 이번 맵 변경사항으로 취급하지 않는다.
  실제 맵 스크린샷과 정확한 한글 설명을 넣고 원본 스크린샷·공개용 원고도 함께 전달한다.
- [ ] 최종 작업 시작 시 원격을 다시 확인하고 최신 `origin/dev`를 후보 작업 기준에 반영한다.
  맵 통합 직전 dev 커밋과 최종 후보 커밋/릴리스 ID를 내부 기록에 고정한다.
  맵이 이미 dev에 통합됐다면 통합 직전 기준을 보존해 변경 전 화면을 재현한다.
  다른 작업에서 이미 반영한 기능을 이번 맵의 신규 기능으로 중복 소개하지 않는다.
- [ ] 위 기준의 실제 코드·에셋·설정 차이와 최종 검수 결과를 대조해 변경사항을 확정한다.
  신규 콘텐츠, 시설 이전·외형 변경, 조작·보상 변경, 오류 수정, 이용 제한을 구분한다.
- [ ] 정문, 중앙마당, 호수, 놀이 구역, 점프맵 등 실제 변화가 있는 대표 장소의 전후 화면을
  실제 브라우저에서 촬영한다. 전경과 플레이어 눈높이를 포함하고 같은 해상도·FOV·시선 방향을
  사용한다. 위치가 이전된 시설은 대응되는 시설과 촬영 기준을 설명한다.
  변경 전 코드는 비교용 격리 위치에서만 실행하며 새 맵 수정·검증의 기준으로 사용하지 않는다.
- [ ] 이미지마다 변경 전/후 표시와 무엇이 달라졌는지 짧은 설명을 붙이고 원본도 함께 보관한다.
  콘셉트 이미지나 검수 전 프리뷰로 최종 플레이 화면을 대신하지 않는다.
  검수 계정 정보·내부 주소·디버그 화면이 노출되지 않도록 촬영한다.
- [ ] 제목, 확정된 업데이트 일자/버전, 핵심 변경 요약, 본문과 비교 이미지, 필요한 이용 안내를
  포함한다. 개발 용어 대신 플레이어가 체감하는 변화와 이용 방법으로 설명한다.
  보상 변경은 기존/변경 수치와 총액·일일 상한을 함께 확인한다.
- [ ] 공사 중인 시설과 실제 이용 가능한 시설을 구분하고 미완료·미검증 기능은 완료로 쓰지 않는다.
  성능 향상이나 VR 지원 범위도 실제 측정·검수 근거가 있는 경우에만 확정 표현을 사용한다.
- [ ] 공개용 원고와 이미지 묶음을 함께 전달하고 이미지 표시·글자 가독성·설명 일치를 확인한다.
  배포 일정이 미정이면 원고를 준비하되 공개 일자를 임의로 정하지 않는다.

이 요청은 공개 가능한 원고 제작 범위다. 기존 로컬 전용·커밋/푸시/MR·머지·배포 보류 조건을
변경하거나 외부 채널 게시를 승인하는 지시로 해석하지 않는다.

이번 기록 시 `git fetch origin`은 네트워크 제한으로 실패했으며, 권한 확장 후 명시적
`git fetch origin dev`는 성공했다. HEAD·origin/dev·FETCH_HEAD는 모두
`06d767394c7dd1f4cd43686186122bb2204c68c1`로 같았고 미해결 충돌은 없었다.
기존 맵 코드와 미커밋 변경을 보존하고 이 완료 조건만 추가했다. 최종 비교 기준은 완료 시 재확인한다.

## 되돌리기

이전 FE·BE 이미지와 맵 마운트 경로를 함께 기록한다. V167은 적용 후 수정·삭제·번호 변경하거나
임의 Flyway repair로 숨기지 않는다. 8~10단계 rows가 존재하는 DB에서 구버전 앱의 조회·정산 호환성을
사전 확인하고, 호환되지 않으면 앱 롤백 대신 수정 배포 또는 승인된 복구 절차를 사용한다.

## 이번 로컬 확인 범위 (2026-11-10)

작업 위치는 `park-renewal-release-local-20261110`, 실제 기준은 최신 fetch의
`origin/dev@ed71c0342534a3f0c9212d9fbd7b93fe0ff1e6d2`다. 시작 당시 전체 fetch는 삭제된
개별 브랜치를 가리키는 기존 fetchspec 때문에 실패했고, 명시적 `git fetch origin dev`로 확인했다.
기존 미커밋 작업을 보존하고 최신 dev로 fast-forward했으며, 조작 안내 카탈로그의 겹친 부분은
dev의 두더지 운영 진입과 공원의 점프맵 안내를 모두 유지했다. 통합 커밋은 만들지 않았다.

에셋 86개·좌표 230개/world 원본·V167 원본 해시, FE 빌드·기존 FE 빌드 호환성,
Linux Docker 이미지 빌드, 읽기 전용 파일시스템에서 `dev,db,park-renewal` 기동을 확인했다.
HTTP·WS 응답 대역 없이 정문 스폰·착석·오목 시작/종료·정산·공원 복귀와 이동을 확인했다.
로그인은 기존 로컬 테스트 발급기를 사용했으며 배포 JAR에 테스트 로그인 endpoint는 없다.
외부 OAuth, 실제 dev 도메인, Jenkins 실행, 40명 부하, VR 헤드셋 검수는 포함하지 않는다.

FE 관련 회귀 60개와 최신 dev 통합 후 25개(배포 모드 3개 포함), BE 관련 회귀 15개가 통과했다.
별도 MySQL 테스트 DB에서 총 250냥·동시 중복 방지·일일 상한 3개가 통과했다.
V166 순차 적용과 원장 실패 주입 2개는 최초에 테스트 계정 권한 부족과 자동 승인 검토 거절로
보류했다. 이후 사용자가 로컬 DB 관리자 자격의 격리 테스트 DB 검수 한정 사용을 명시적으로
승인하여 남은 2개도 실행했고 모두 통과했다(누적 MySQL 검수 5개).
V166의 기존 7단계/250냥 기록을 유지하면서 V167 적용 후 10단계를 허용하고 11단계를 거부했다.
원장 INSERT 실패 시 지급 전액과 상태가 롤백되고, 실패 원인 제거 후 재시도를 반복해도
5냥이 정확히 한 번만 반영됐다. 관리자 자격은 메모리/테스트 프로세스 환경에서만 사용하고
출력하거나 새 파일로 저장하지 않았다. 계정 권한·MySQL 전역 설정을 바꾸지 않았으며,
기존 검수 회원 DB와 V169 DB, 매핑 230개/world 구조와 V167 원본 해시는 보존했다.

커밋·푸시·MR·dev 반영·Jenkins 실행·작업 브랜치 삭제는 하지 않았다.

## dev 게임 목록 대조 및 실제 로컬 통합 검수 (2026-11-10 후속)

`origin/dev@06d767394c7dd1f4cd43686186122bb2204c68c1`를 fetch 후 실제 작업 위치에
fast-forward했다. 충돌 없이 기존 미커밋 변경을 보존했다. 공개 보드게임은 알까기·오목·주사위 한 판·
원카드·주사위 장부·과일 땡 6종이며, 거짓말 다리는 기존 공사중 상태를 유지한다.
오락실 4종(두더지·스피드 두더지·가위바위보 룰렛·플러스마이너스), 붕어빵 v4와 협동 꼬치왕 PC도
실제 로컬 프론트·배포 JAR·MySQL 8.4로 진입·플레이·종료·정산·공원 복귀를 확인했다.
HTTP/WS 대역과 강제 점수·타이머 변경은 사용하지 않았다. 오목은 자연 승리,
나머지 보드게임 5종은 유효한 실제 행동 이후 상대 기권 종료로 공통 정산·복귀를 확인했다.
모든 자연 승리 조건이나 4인 조합을 전부 실행했다는 뜻은 아니다.

수정한 연결은 다음과 같다.

- 새 맵 배포 빌드의 기능 설정 기본값을 기존 dev와 맞추고 명시적 false 설정을 보존했다.
- 기존 VR 입구의 reach/radius/높이 허용치를 서버 맵에 내보내고 BE가 읽도록 수정했다.
  이전 맵의 입구 계산은 유지하고 불완전한 새 맵 설정은 거부한다.
- 협동 경기가 종료되는 순간 방 GET이 신규 입장 검사에 걸리던 409 문제를 수정했다.
  본인의 아직 닫지 않은 결과 조회만 별도 허용하고 POST 새 입장 조건은 유지한다.
  수정 이미지에서 2인 자연 종료(SKEWER_TIME_UP), 261점·서빙 1팀, 두 참가자 각각 13냥 지급,
  반복 결과 조회 시 잔액 불변, 결과 닫기·공원 이동까지 다시 통과했다.
- 기존 점프맵 전달 파일의 오래된 소스 체크섬만 갱신했다. 발판 배치는 변경하지 않았다.

뽑기기계는 로컬 DB에 실제 상품 목록이 없어 최초 구매가 GACHA_CATALOG_NOT_READY로 거절됐고
차감은 없었다. 기존 에셋을 쓰는 명시적 QA 상품 4개를 검수 DB에만 추가한 뒤 구매·추첨·
동일 요청 재전송 시 중복 소비 방지와 공원 복귀를 확인했다. 이 상품은 운영 상품 등록 증거가 아니다.
배포 시 기존 dev의 실제 상품·보유 데이터와 활성화 설정을 보존하고 등록 상태를 별도 확인한다.
복권방의 구매·번호 수령·중복 차감 방지·복귀도 통과했으며 주간 추첨을 강제 실행하지 않았다.
운세방 E키 공사 안내를 직접 확인했고 지정 시설 16곳의 구성·좌표·메시지는 그대로 보존했다.

기존 좌표 230개/world 전체·V167 원본 해시를 재대조했다. 점프맵은 앞선 실제 10단계 완주·
250냥·중복 지급 방지 검수와 코스 불변 대조 및 이번 회귀 테스트를 근거로 한다.
이번 회차에 새 점프맵 완주를 실행했다고 표시하지 않는다. 관련 FE 회귀 32개와
BE 회귀 62개(PreparedParkMap 12, TableHubSkewerEntry 14, SkewerCoopEngine 32, Controller 4),
배포 FE/서버 이미지 빌드와 릴리스 검사, diff 검사를 통과했다.
최종 mapVersion은 `2e82b969855f99de9a3f59955e1631f07f02e3149793b87434e6c2a2c34f90dc`다.

VR 헤드셋·외부 OAuth·실제 dev 도메인·Jenkins·40명 부하는 검수하지 않았다.
커밋·푸시·MR·dev 반영·브랜치 삭제 없이 detached HEAD 로컬 작업과 기존 변경을 보존했다.
