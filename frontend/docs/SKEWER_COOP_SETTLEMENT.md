# 온탑 꼬치왕 — 보상·팀 랭킹·공동 결과

작성: 2026-11-02. 번호 재지정 기준 `origin/dev@704350b06283a0726003a77668c34e1587acb29e`.
작업 위치 `C:/Users/SSAFY/Desktop/OnTop/skewer-service-hall`, 브랜치 `feat/S15P31B105-298-skewer-coop`.
로컬 코드와 별도 MySQL 검증이며 공유 DB 적용·두 기기 플레이·Quest 검수·배포 완료를 뜻하지 않는다.

## 확정한 보상 계약

- 입장료·판돈은 없다. 서버의 최종 팀 점수에서 `floor(score / 20)`을 계산해 **각 사람에게 각각** 적용한다.
- 개인 실제 지급액은 `min(기본 환산액, max(0, 500 - 오늘 이미 받은 모든 미니게임 보상))`이다.
- 날짜는 기존 `MinigameRewardBudget.KST`의 한국 시간 자정 기준이다. 기존 원장의 `MINIGAME_REWARD`, `JUMP_GATE_REWARD`, `SKEWER_REWARD`를 합산한다. 가입 보너스·보드게임 배당·참가비는 합산하지 않는다.
- 한도는 두 사람별로 계산한다. 팀 점수 2,400점에서 한 명이 이미 490냥, 다른 한 명이 30냥을 받았다면 각각 10냥·120냥을 지급한다.
- 기권·연결 종료도 종료 전에 확정한 점수만 환산한다. 시작 전 종료는 0점/0냥 영수증이다. 전달하지 않은 음식이나 미완료 청소를 추가 점수로 만들지 않는다.
- 엔진은 점수·역할·VR 자격·종료 사유의 불변 결과만 발행한다. 별도 정산 소비자가 공통 Wallet 엔티티·원장을 사용한다. 엔진이 잔액을 직접 수정하거나 판돈 정산 소비자로 무료 결과를 보내지 않는다.

## 저장·멱등성

- `skewer_coop_results`: 경기 ID당 불변 팀 결과 1개. 점수, 역할, 정규화한 두 회원 ID, 종료 사유, 규칙/영업시간, VR 랭킹 자격을 저장한다.
- `skewer_coop_rewards`: `(game_id, user_id)`당 개인 영수증 1개. 기본/실제 지급액·정산 날짜·정산 직후 잔액을 저장한다.
- 한 트랜잭션에서 결과 행을 잠근 뒤 회원 ID 순으로 두 지갑을 잠그고, 기존 공통 일일 합산을 조회하고, 두 사람의 지갑·원장·영수증을 모두 확정한다. 한쪽 지갑이나 저장이 실패하면 모두 롤백한다.
- 원장 멱등 키는 `skewer-coop:<gameId>:<userId>`, 거래 유형은 기존 일일 합산에 포함된 `SKEWER_REWARD`다. 신규 game_session 판돈 행이나 입장 차감은 만들지 않는다.
- 같은 결과의 재시도는 저장한 영수증을 재사용한다. 같은 경기 ID에 다른 결과 내용이 오면 결과 해시 불일치로 거절한다. 0냥도 영수증을 저장하되 양수 원장을 만들지 않는다.
- DB 오류는 영업 타이머와 분리한 정산 작업에서 재시도한다. 화면은 확정 전 `PENDING`, DB 없는 독립 검수 앱은 `UNAVAILABLE`, 저장 후에만 `SETTLED`다. 프론트는 잔액을 직접 더하지 않고 기존 지갑 GET 무효화 함수를 호출한다.
- 결과창을 일찍 닫으면 같은 계정에 한해 개인 영수증을 2초 간격으로 최대 15회 다시 조회해 지갑을 갱신한다. 계정이 바뀌면 중단한다. 이때 정산 입력이나 새 보상 요청은 보내지 않는다.
- 종료 알림 전에 결과를 영속 디스크 저널에 먼저 인계한다. DB 장애·프로세스 재시작 뒤에는 저널을 복구해 정산한다. DB 커밋이 성공한 뒤에만 저널을 제거하며, 커밋 직후 종료되어 재전달되어도 기존 멱등 키로 중복 지급을 막는다. 저널 인계 실패는 종료 결과를 캐시해 5초마다 다시 시도한다. DB 정산 작업은 게임 타이머와 별도 스레드이며 서로의 모니터 잠금을 공유하지 않는다.
- 보장 범위는 **영속 저널 기록을 마친 종료 결과의 프로세스 재시작 복구**다. 경기 진행 중 상태, 디스크 기록 전 장애, 영속 볼륨 삭제/손실 및 호스트 전원 장애 전체 복구는 보장하지 않는다. 서버 인스턴스별로 고정 경로를 유지하고 컨테이너 임시 파일시스템을 사용하지 않는다. 손상 파일은 삭제/무시하지 않고 기동 실패로 드러내며, 동일 디렉터리의 동시 프로세스 접근은 파일 잠금으로 거절한다.
- DB가 복구되는 날에 실제 지급·일일 상한을 적용하는 기존 정책을 유지한다. DB 지연으로 자정을 넘긴 결과는 실제 정산일의 공유 500냥 한도에 합산한다.

## 팀 랭킹 기본 정책

- `coop-v1`, 영업 240초, `SKEWER_TIME_UP` 정상 종료, 요리사의 VR 자격을 끝까지 유지한 기록만 등록한다.
- 처음부터 PC, 경기 중 VR→PC 전환, 기권·재접속 시간 초과는 제외한다. 보상 지급 여부와는 별개다. VR 재연결로 제외 자격을 복구하지 않는다.
- 전체 기간(`ALL_TIME`)의 같은 두 회원 최고 점수(`TEAM_BEST`)를 집계한다. 역할을 바꾸어도 같은 팀이다. 최고 점수가 같은 기록은 먼저 완료한 경기·경기 ID 순으로 한 건을 선택한다.
- 점수가 같은 팀은 공동 순위다. 표시 순서는 점수 내림차순 → 완료 시각 → 경기 ID다. 상위 20개와 요청 회원이 포함된 최고 팀 기록 하나를 반환한다.
- 탈퇴한 회원이 포함된 팀은 조회에서 제외한다. 이번에는 공원의 기존 랭킹판 종류나 다른 게임의 랭킹 API를 변경하지 않았다.
- WebXR 실제 세션의 연결/해제 보고를 기존 엔진에서 사용한다. 변조 클라이언트에 대한 하드웨어 사용 증명이나 추가 치팅 탐지는 구현하지 않았다.

## FE·BE API

인증된 기존 REST/공통 소켓을 재사용한다. 아래 조회는 입구 거리 검사와 분리한다. 경기 종료 후 공원으로 돌아와도 본인의 영수증을 읽을 수 있어야 한다.

| 요청 | 동작 |
| --- | --- |
| `GET /api/v1/minigames/skewer/coop/result?gameId=<id>` | 인증 회원 본인의 영수증. 다른 참가자의 잔액/보상은 반환하지 않음. 본인 경기만 허용 |
| `GET /api/v1/minigames/skewer/coop/rankings` | 상위 20팀과 본인 최고 팀 기록. 점수/회원 ID를 입력받아 쓰는 API는 없음 |

개인 결과에는 `status`, `teamScore`, `served`, `endReason`, `rankingStatus/reason`, `coinsCalculated`, `coinsGranted`, `todayEarned`, `dailyCap`, `remainingToday`, `balance`, `rewardDate`, `settledAt`를 담는다. 미확정 지급액·잔액·날짜는 null이다. `todayEarned/remainingToday`는 **조회 시점의 오늘** 기준이고, `rewardDate/coinsGranted/balance`는 저장한 정산 영수증 기준이다. 다음 날 열어도 보상을 재지급하지 않는다.

공통 결과 화면은 두 역할 모두 기존 `PaperPopup`, `ResultTrophy`, `RewardCoinSource`를 재사용한다. 팀 점수 → 서빙 수/개인 기본 환산 → 실제 받은 엽전/일일 한도 → 랭킹 사유 → 공원 복귀/팀 랭킹 순서로 표시한다. VR 주방의 공간 주문판에도 팀 점수·보상 상태·랭킹 상태를 표시하고 기존 공간 버튼으로 결과를 닫을 수 있게 했다. 실기기 조작 확인은 사용자 최종 테스트 단계다.

## Flyway 현재 번호와 재지정 기록

- **현재 꼬치왕 버전은 V145**이며 파일은 `backend/src/main/resources/db/minigame/V145__create_skewer_coop_results.sql`이다.
- 2026-11-04 사용자가 팀 조율 완료 및 꼬치왕 V145 사용을 확인했다. V146 미배포 소스를 V145로 재지정하며 SQL DDL 본문은 그대로 유지한다.
- 최신 `origin/dev@44370922`를 작업 위치에 반영했다. 원격에는 파클 V144까지 있고 V145/V146은 없다. GitLab 웹에서 열린 MR 0개를 확인했다(API 인증은 401). 다른 로컬 `farkle-four-players-local`의 과거 V145는 보존하며, 파클은 현재 dev의 V144로 통합되어 있다.
- 실제 공유 DB 적용 이력은 확인하지 못했다. 이 작업은 공유 DB를 변경하지 않으며, 인프라 담당자가 배포 전 이력과 번호를 다시 확인해야 한다.
- 과거 꼬치왕 V138/V140/V141/V144/V146 로컬 검증 DB는 이력·데이터를 보존하고 현재 앱에 재연결하거나 repair/clean하지 않는다. V146 원본은 로컬 검증 산출물에 보존한다.
- `application-db.yml`의 dev+db는 `db/migration,db/minigame`을 함께 적용한다. 그 외 프로필은 실제 `DB_MIGRATION_LOCATIONS`에 minigame이 포함되는지 확인한다.
- 아래 날짜별 과거 기록의 버전은 당시 검증 버전이다. 현재 배포 번호와 구분한다.

### 최초 V138 작성 당시 이력 (현재 배포 번호 아님)

- 사용자가 2026-11-02 이 채팅에서 **V138 사용 가능·이번 작업 사용**을 확인했다.
- 당시 파일: `backend/src/main/resources/db/minigame/V138__create_skewer_coop_results.sql` (현재 V145로 변경).
- 목적: 위 공동 결과·개인 정산 영수증 2개 테이블과 팀 랭킹 인덱스. 기존 migration 수정 없음.
- 생성 전 fetch 기준 `origin/dev@f83f16b0`, 최대 V137. 원격 브랜치 19개·로컬 worktree 75곳에 V138 이상 파일 없음. GitLab 열린 MR API는 401로 조회하지 못했고 이 제약을 공유한 후 팀 점유 확인을 받았다.
- `application-db.yml`의 `dev & db`는 `db/migration,db/minigame`을 함께 사용한다. 다른 DB 프로필은 실제 `DB_MIGRATION_LOCATIONS`에 `classpath:db/minigame`이 포함되는지 확인해야 한다. 기존 DB를 초기화하거나 repair하지 않는다.
- `ontop.games.skewer-coop.enabled=true`와 `db`를 함께 사용하면 시작 시 두 저장 테이블의 존재를 확인한다. 현재 배포에는 V145 적용이 필요하다.
- 2026-11-02 별도 로컬 MySQL 8.4에 V138을 적용했고, V137 DB의 기존 회원·지갑을 보존한 순차 적용도 검증했다. 공유 DEV/운영 DB에는 미적용이다. 통합/머지 직전에는 번호 점유와 팀 예약을 다시 확인해야 한다.

## 실행·최종 검수 인계

기존 독립 프리뷰와 DB 없는 공원 검수 서버(프론트 5244/백엔드 19185)는 그대로 사용할 수 있다. DB 없는 검수 앱은 실제 지급을 만들지 않고 결과에 저장소 미연결을 표시한다.

실제 보상은 정상 인증·회원/지갑이 연결된 기존 백엔드에 `db,skewer-coop` 프로필(기존 local/dev와 함께), 위 migration locations와 `SKEWER_COOP_JOURNAL_PATH` 영속 절대 경로를 적용한 환경에서 사용한다. 프론트는 기존 `vite.skewer-coop.config.ts --mode park-integration`을 사용하고 `API_PROXY_TARGET`을 해당 백엔드로 지정한다. 생성 맵·Origin·인증 callback·Quest HTTPS 설정은 [SKEWER_COOP_NETWORK.md](SKEWER_COOP_NETWORK.md)를 따른다.

사용자 최종 검수 항목:

1. 별도 MySQL 8.4 신규 DB에 전체 migration, 현재 dev의 V144까지 적용한 전용 DB에 V145 순차 적용. 운영 DB를 테스트 대상으로 사용하지 않는다.
2. 실제 두 계정: 20점당 각자 1냥, 0냥, 한쪽만 한도 근접, 다른 미니게임 보상과의 합산, 한국 시간 자정 전후.
3. 같은 결과 재조회/재접속/동시 종료에서 원장·지갑 중복 없음, 한쪽 실패 시 공동 롤백과 재시도.
4. 정상 VR/비VR/도중 전환/기권/연결 종료의 보상·랭킹 상태, 같은 팀의 역할 변경·최고 기록·동점·탈퇴 필터.
5. 서빙/PC 요리사/VR 공간 결과판, 낮은 화면에서 마지막 버튼, 공원 복귀 후 실제 잔액 갱신.

준비한 DB 검사 클래스는 `JdbcSkewerCoopResultStoreTests`다. 직접 실행할 때 `TEST_SKEWER_COOP_DB_URL`은 `jdbc:mysql://127.0.0.1:<port>/ontop_skewer_coop_test_<suffix>` 형태의 새 전용 DB만 받는다. `TEST_SKEWER_COOP_DB_USERNAME/PASSWORD`를 해당 테스트 계정으로 지정한 뒤 backend에서 `./gradlew.bat mysqlTest --tests '*JdbcSkewerCoopResultStoreTests' --console=plain`으로 실행한다. 단위/브라우저 검사와 DB 적용 성공은 구분해 기록한다.

공통 변경은 기존 `WalletTransaction`의 보상 원장 생성 메서드와 `SpringParkRuntime`의 두 GET 허용 경로다. 지갑 갱신·종이 결과 팝업·보상 연출은 기존 함수를 재사용한다. 게임 규칙/저장/정산/API는 `game/skewer/coop/`, FE는 `features/skewer/coop/`에 둔다.

2026-11-04 사용자 요청에 따라 커밋·푸시·Draft MR까지 진행한다. 머지·배포는 별도 승인과 인프라 작업 후 진행한다.

## 최초 보상 연결 당시 코드 검사 결과 (번호 재지정 전)

- 작업 중 추가된 최신 공원 랭킹 FE 변경 `origin/dev@4a3f6fdf`까지 fast-forward로 반영했다. 반영 직전 로컬 변경 82개 파일의 해시가 반영 직후 모두 동일했다. 변경 경로의 충돌은 없었고 신규 자체 커밋은 0개다.
- 백엔드 협동 엔진·정산 서비스 단위 16개, 프론트 결과·협동 입력·공통 지갑·최신 공원 랭킹 단위 27개 통과. Java main/test 컴파일과 앱/테스트 TypeScript 검사를 통과했다.
- 협동 모드를 켠 전체 공원 Vite 빌드(873모듈) 통과. 기존 큰 Three.js/물리 청크·CommonJS 및 개발 config import 확장자 경고는 남아 있다. 빌드는 저장소 밖 `coop-rewards-20261102/build/`에 보관했다.
- DB 전용 검사 4개는 작성·컴파일만 했다. 실제 MySQL migration/정산 검사는 실행하지 않았다. 기존 브라우저 시나리오는 새 공통 결과 dialog 선택자로 맞췄으나 이번에는 재실행하지 않았다. 실제 두 기기·Quest·UI 수동 플레이 검수는 사용자에게 남겼다.
- DB 없는 loopback 검수 서버 19185를 당시 최신 코드로 다시 실행했다. 이 환경은 테스트 인증/조회 대역이며 실제 지급 저장소는 없다. 현재 정상 DB 환경에는 V145을 적용한 뒤 지급을 확인해야 한다.
- 최종 worktree 검색에서 V138 파일은 이번 파일 한 곳뿐이었다. 기존 DB migration은 수정하지 않았다. 열린 MR 조회 401 제약은 남아 있으며 통합 직전 다시 확인해야 한다.

## 2026-11-02 복구·DB 연결 보강 이력 (번호 재지정 전)

- 최신 GitLab dev를 fast-forward 반영했고 기존 변경을 외부 백업에 보존했다. 새 migration 없이 승인된 V138 원본을 그대로 사용했다.
- 복구 기록: 경기별 JSON을 force한 임시 파일에서 원자적으로 이동한 뒤 인계한다. `.tmp`만 남은 경우 인계 완료가 아니며 복구 지급 대상이 아니다. `.json` 손상/ID 불일치는 기동을 중단한다. 경로 권한은 앱 계정 전용으로 제한하고 디스크 여유 공간을 관찰한다.
- 단위 21개: 엔진·정산·저널, 저널 실패 후 동일 불변 결과 재시도, 중복/손상/잠금, 청소 취소 및 4+3점 확정.
- MySQL 7개: 실제 별도 JVM 강제 종료 후 복구 지급, 커밋 후 동일 결과 재전달 시 원장 2개 유지, 개인 일일 상한·롤백·0냥·팀 랭킹, 신규 DB 및 V137→V138 순차 적용, 정상 온보딩→JWT→본인 결과/지갑 HTTP 조회. OAuth 공급자 신원 입력만 테스트로 생성했으며 외부 소셜 로그인까지 완료했다는 의미는 아니다.
- 로컬 MySQL: 컨테이너 `ontop-skewer-recovery-mysql-20261102`, `127.0.0.1:13386`, 별도 named volume. 공유 DEV 데이터를 가져오거나 초기화하지 않았다. 테스트 인증 우회 컨트롤러 없이 `local,db,skewer-coop` 앱의 기동을 확인했다.
- 정상 로컬 실행: 저장소의 `scripts/start-skewer-coop.ps1 -EnvironmentFile <Git 밖 설정 경로> -Check`로 설정을 확인한 뒤 같은 명령에서 `-Check`를 빼서 기동한다. 기본 BE 19186, FE 5244의 `API_PROXY_TARGET=http://127.0.0.1:19186`. 실제 OAuth 클라이언트와 등록된 콜백 URL은 사용자 환경의 값을 사용한다.
- GitLab 개발 DB 설정 위치는 `infra/app/dev.app.env.example`과 `infra/app/compose.dev.yaml`에 명시되어 있다. 실제 값은 DEV 서버 `/etc/ontop/dev-app/app.env` 및 `secrets/mysql-app-password`에 있으며 Git에 포함되지 않는다. SSH ubuntu/jenkins와 현재 키로 인증에 실패했고 문서의 `~/.ssh/ontop/ontop-dev-ci-key.pem` 파일은 이 PC에 없었다. 공유 DEV의 V138 이력/설정은 직접 확인하지 못했다.
- 배포 준비용 `infra/app/compose.skewer-coop.yaml`을 추가했다. DEV host에 앱 uid 10001 소유의 영속 디렉터리를 준비하고 `SKEWER_COOP_JOURNAL_HOST_DIR`를 지정한다. 기본 dev Compose와 현재 generated-map override에 **추가**해서 적용한다. 기존 JWT/OAuth/DB/맵 환경을 덮어쓰지 않는다.
- 현재 Jenkins 배포 실행기는 이 새 override를 자동 포함하지 않는다. DEV 활성화 전에 서버의 실제 배포 실행 경로에 override를 영구 포함하고 이후 재생성에도 마운트/프로필을 유지해야 한다. 파일 추가만으로 공유 서버에 기능이 활성화되지 않는다. 이 작업에서 커밋/푸시/MR/머지/Jenkins 재실행은 하지 않았다.

최종 추가 확인: FE 규칙/입력/결과 단위 33개, 앱·테스트 TypeScript 검사 통과. 로컬 실행기 PowerShell 구문 및 기본 DEV Compose+협동 override 결합 검사를 통과했다. 기존 19185 검수 서버만 최신 코드로 재시작했고 이 서버의 보상은 계속 UNAVAILABLE이다. 실제 DB 검증 서버는 테스트 실행 종료 시 닫혔으며 공유 개발 서버로 전환하지 않았다.

## 2026-11-02 V140 재지정 검증 이력 (현재 배포 번호 아님)

- 로컬 변경 91개 파일을 외부에 백업한 뒤 최신 기준 `7c650f0b`를 fast-forward 반영했다. 기존 파일 해시 91개가 모두 유지됐고 최신 변경과 경로 충돌은 없었다.
- V140은 번호와 사전 공유 주석만 바꿨으며 테이블 생성 SQL은 기존 꼬치왕 파일과 동일하다. 저장소 시작 오류 안내·현재 배포 문서·순차 적용 테스트도 V140으로 맞췄다.
- 기존 MySQL 컨테이너 안에 **새 전용 스키마 3개**를 생성했다. 기존 V138 꼬치왕 검증 DB와 저널 파일은 변경하지 않았다. 공유 DB는 연결하지 않았다.
- `SkewerCoopMigrationTests`: V139 원본의 검증용 복사본을 저장소 밖에 두고 `TEST_SKEWER_COOP_PREREQUISITE_MIGRATIONS`로 추가했다. V138 랭킹 → V139 판돈 0 허용 → V140 꼬치왕 순서, V140 1회 적용, 기존 회원·지갑 보존, 재실행 0건, Flyway validate 성공을 확인했다. V139 소스의 SHA-256도 변경 전후 동일하다.
- `JdbcSkewerCoopResultStoreTests` 5개, `SkewerCoopAccountMySqlTests` 1개, migration 1개로 MySQL 검증 **7개 통과**. 신규 DB 적용·중복 지급 방지·강제 종료 후 복구·개인 일일 상한·공동 롤백·랭킹·인증된 본인 결과/잔액 조회를 검증했다. 계정 테스트의 외부 OAuth 신원은 fixture다.
- 저장/계정 테스트 DB는 현재 꼬치왕 모듈 소스만 사용해 V138·V140을 적용했다. V139를 포함한 순차 검증 DB와 구분하며, 이 테스트 DB를 향후 공유 배포 또는 정상 개발용 DB로 재사용하지 않는다.
- 검증 실행: 전용 새 DB URL 3개와 기존 테스트 계정 환경변수, 필요 시 선행 SQL 디렉터리를 설정한 뒤 `./gradlew.bat mysqlTest --tests '*SkewerCoopMigrationTests' --tests '*JdbcSkewerCoopResultStoreTests' --tests '*SkewerCoopAccountMySqlTests' --console=plain`. 순차 검증 DB는 빈 DB 조건이 있으므로 재실행 시 새 이름을 사용한다.
- Java main/test 컴파일과 `git diff --check` 통과. 프론트 화면 변경은 없으며 브라우저/Quest 검수는 재실행하지 않았다. 커밋·푸시·MR·원격 머지·Jenkins·배포·브랜치 삭제는 진행하지 않았다.

## 2026-11-02 V141 재지정 검증 이력 (현재 배포 번호 아님)

- 사용자 정정에 따라 꼬치왕을 V140에서 V141로 변경했다. SQL 본문은 동일하고 파일명·사전 공유 주석·저장소 오류 안내·테스트·현재 문서를 갱신했다. 기존 꼬치왕 V138/V140 DB는 보존했다.
- 작업 시작 시 최신 `origin/dev@704350b0`를 반영했다. 로컬 변경 91개를 외부 파일 백업과 stash에 보존했다. 공통 재접속 코드 충돌은 최신 기권자 로비 복귀 필터와 무료 협동 경기 복구 예외를 함께 유지해 해결했다. TableHub·WalletTransaction·SpringParkRuntime의 양쪽 수정도 보존했다.
- 별도 로컬 MySQL 8.4 신규 스키마에서 현재 제공된 V139까지 적용하고 V141만 추가했다. Flyway validate·재실행 0건·기존 회원/지갑 보존 및 정산/중복/복구/인증 검증 합계 **7개 통과**. 존재하지 않는 V140을 target으로 지정했던 첫 순차 검증은 실패했으며, 실제 제공된 선행 버전을 선택하도록 수정 후 재검증했다.
- 팀원의 V140 SQL은 아직 제공되지 않아 **실제 V140 → V141 순차 검증은 미완료**다. 이 검증용 DB는 공유 배포/정상 개발용으로 재사용하지 않는다. V140 통합 뒤 새 DB에서 다시 확인한다. 테스트의 `TEST_SKEWER_COOP_PREREQUISITE_MIGRATIONS`에는 필요 시 팀원의 실제 V140 검증용 복사본만 지정한다.
- 재접속·꼬치왕 엔진/정산/저널 단위 **34개**, FE 협동 입력/결과/공원 runtime 테스트 **51개**, FE 타입 검사와 `git diff --check` 통과. 브라우저·Quest 수동 검수는 재실행하지 않았다.
- 공유 DB·저널·배포 설정은 변경하지 않았다. 작업 브랜치 `feat/skewer-service-hall-20261101`에 로컬 변경만 보관하며 커밋·푸시·MR·원격 머지·Jenkins·배포·브랜치 삭제는 하지 않았다. 백업 stash는 복구용으로 유지한다.

## 2026-11-03 V144 재지정 및 검증

- 사용자 지정으로 꼬치왕 소스 파일을 V141에서 `db/minigame/V144__create_skewer_coop_results.sql`로 변경. 첫 번호 안내 주석 외 SQL 본문 동일 비교 통과. 저장소 시작 오류 안내와 현재 배포 문서/순차 적용 테스트를 V144로 맞춤. 과거 V138/V140/V141 검증 기록은 이력으로 보존.
- fetch 기준 HEAD=origin/dev `d16def39`, 기존 미커밋 작업 유지 및 기준 차이 없음. 원격 브랜치/등록된 모든 로컬 worktree의 DB 경로에서 V144 중복 없음. 다른 로컬 V141(점프맵 보상)은 수정하지 않음. 열린 MR API는 401로 확인 불가. 팀 예약은 사용자의 V144 지정에 따름.
- 기존 로컬 MySQL 8.4 컨테이너에 새 전용 test/upgrade/auth 스키마 3개를 만들어 검증. 기존 V141 DB 세 곳의 Flyway script/checksum/success를 전후 비교해 동일 확인. clean/repair/기존 DB 초기화 없음. 구 V141 SQL 백업을 `coop-v144-20261103/V141__create_skewer_coop_results.sql` 산출물에 보존.
- 새 DB 전체 적용 및 현재 제공된 V140 → V144 순차 적용 성공. V144 실행 1건, 재실행 0건, validate 및 기존 회원/지갑 137냥 보존 확인. V141~V143 선행 SQL은 아직 통합되지 않았으므로 이를 포함한 전체 배포 순서 검증은 별도다.
- `mysqlTest --tests '*SkewerCoopMigrationTests' --tests '*JdbcSkewerCoopResultStoreTests' --tests '*SkewerCoopAccountMySqlTests'`: **7개 통과**, main/test Java 컴파일 및 diff --check 통과. 중복 정산/일일 상한/공동 롤백/팀 랭킹/강제 종료 복구/정상 회원·인증된 결과 조회를 검증. 외부 OAuth 및 실제 Quest 검수는 별도.
- `build/resources/main`의 낡은 생성 리소스 V141만 제거하고 V144 한 파일로 다시 빌드함. 기존 소스/다른 게임 migration은 보존. 현재 소스 전체 DB 경로 중복 버전 없음.
- 담당 경로: 꼬치왕 migration, game/skewer/coop 저장소 안내, game/skewer 테스트, 관련 기획/정산/네트워크/홀 문서. 공통 동작/FE-BE 계약/공유 DB·배포 설정 변경 없음. 로컬 전용 `feat/skewer-service-hall-20261101` 유지, 커밋/푸시/MR/머지/Jenkins/브랜치 삭제 미진행.


## 2026-11-03 V146 재지정 및 검증

- 사용자 요청으로 로컬 꼬치왕 V144를 V146으로 변경했다. V144는 사용자 다른 보드게임, V145는 팀원 사용이다. SQL 본문 동일 비교 통과. 저장소 시작 안내·순차 적용 테스트·현재 기획/연결 문서를 V146으로 맞췄으며 과거 검증 기록은 유지했다.
- 기준 HEAD=origin/dev `0ff615aa`, 브랜치 `feat/skewer-service-hall-20261101`. 원격 33개·worktree 93곳에서 V146 점유 없음. 다른 작업의 V145 파클 파일은 보존. GitLab 열린 MR API는 404로 확인하지 못했으며 공유 DB 이력은 이번에 확인하지 않았다.
- 원본 V144 SQL을 `coop-v146-20261103` 산출물에 보존하고 기존 로컬 V144 test/upgrade/auth DB 세 곳의 Flyway script/checksum/success를 전후 비교해 동일함을 확인했다. 기존 DB clean/repair/초기화 없음.
- 별도 새 MySQL 8.4 DB 세 곳에서 전체 적용과 제공된 선행 버전 → V146 순차 적용 성공. V146 1회 실행, 재실행 0건, validate 및 기존 회원/지갑 137냥 보존 확인. 아직 제공되지 않은 선행 migration을 포함한 배포 순서 검증은 통합 시 별도 진행한다.
- `mysqlTest --tests '*SkewerCoopMigrationTests' --tests '*JdbcSkewerCoopResultStoreTests' --tests '*SkewerCoopAccountMySqlTests'` 7개 통과. main/test 컴파일 및 diff --check 통과. 최초 검증 스크립트의 과거 자료 날짜 경로 오타는 DB 생성 전 실패했으며 경로 수정 후 재실행에 성공했다.
- 생성 리소스의 낡은 V144 파일만 제거하고 다시 빌드했다. 현재 DB 소스의 버전 중복 없음, 소스/빌드 모두 꼬치왕 V146 한 파일만 존재한다.
- 변경 범위: 게임 migration·저장소 오류 안내·migration 테스트·관련 문서 및 상위 AGENTS 번호 기록. FE/BE 동작·공통 계약·지갑 정책·공유 DB·배포 설정 변경 없음. 기존 독립 실행(5244 프리뷰/19185 DB 없는 검수)은 유지하며 실제 공유 서버 통합 완료를 뜻하지 않는다.
- 로컬 전용 유지. 커밋·푸시·MR·머지·Jenkins·브랜치 삭제 미진행. 검증 산출물은 `coop-v146-20261103`에 보존했다.

## 2026-11-04 V145 통합 검토

- 팀 조율 후 V145 사용 확인. 최신 origin/dev `44370922`에서 작업하고 Jira `S15P31B105-298`에 맞춰 브랜치를 `feat/S15P31B105-298-skewer-coop`으로 정리했다.
- V146 소스는 로컬 산출물로 백업했다. 첫 안내 주석 외 SQL DDL 동일. 과거 V146 테스트 DB 3개의 script/checksum/success 이력을 변경 전후 비교해 보존을 확인했다. 공유 DB 적용이나 repair/clean은 하지 않았다.
- 별도 MySQL 8.4 신규 DB 3개에서 현재 모든 선행 파일(V141~V144 포함)과 V145 적용. 순차 V144 → V145 1건 적용, 재실행 0건, validate, 기존 계정·지갑 137냥 보존 확인. DB 검사 7개 통과(정산 멱등성·500냥 합산·공동 롤백·랭킹·인증·프로세스 강제 종료 복구).
- BE 엔진·복구·기존 파클/공통 소켓·맵 검사 124개 통과. 환경 조건으로 처음 제외된 generated 맵 11개는 최신 맵과 환경별 바인딩을 제공해 별도 통과했다.
- FE 꼬치왕 단위 107개, TypeScript, 기본 공원 빌드와 협동 활성 빌드 통과. 브라우저: 요리사 6개·서빙 6개·일시정지 3개·실제 공통 소켓 2계정 흐름 1개 통과. UI 개편에 뒤처진 테스트를 현재 영수증/R 제출/인사 타이머/식기 카트/나가기 창에 맞췄다.
- 실제 공통 소켓 검사는 loopback의 독립 브라우저 두 개, 테스트 로그인 대역/최신 맵/실제 협동 엔진을 사용했다. 실제 두 노트북·Quest 2·공유 DB 지급·공유 서버 배포 검증과 구분한다.
- 기본 배포의 협동 활성화는 자동 변경하지 않는다. FE `VITE_SKEWER_COOP_ENABLED=true`, BE `skewer-coop` 프로필, V145 migration location, 인스턴스 전용 영속 저널과 compose override를 인프라 담당자가 함께 적용해야 한다. 기존 DB/JWT/OAuth 설정과 generated-map override를 보존한다.
- 사용자 승인 범위는 커밋·푸시·Draft MR까지다. 머지·배포·브랜치 삭제는 보류한다. 저장소 Jenkinsfile은 dev 전용이며 MR 빌드와 dev 배포 성공을 혼동하지 않는다.
