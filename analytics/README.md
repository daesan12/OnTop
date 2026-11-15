# 행동 로그 분석

S15P31B105-178. 서버가 남기는 행동 로그(`behavior_events`, `world_position_samples`)로 서비스 개선 지표를 뽑는 쿼리와 검증 도구다. 수집 설계와 이벤트 목록은 [docs/behavior-log.md](../docs/behavior-log.md)를 따른다. 붕어빵·소리함처럼 기능이 자체 테이블에 이미 기록을 남기는 경우는 행동 로그를 따로 만들지 않고 그 테이블을 읽는다(S15P31B105-210, -211).

## 데이터 접근 원칙

- **운영 DB에 직접 쿼리하지 않는다.** 위치·구역 쿼리는 행 전체를 읽어서 운영 중인 게임 DB를 느리게 만들 수 있다. 매일 KST 03:00에 만들어지는 백업(`ontop-prod-*.sql.gz`)을 받아 **네트워크가 분리된** 로컬 MySQL 컨테이너에 복원해서 분석한다. 백업을 받는 방법은 [infra/prod-db/README.md](../infra/prod-db/README.md)의 "분석용 최신 백업 한 건 받기"를 따른다.
- **원본 데이터와 결과 파일은 커밋하지 않는다.** `analytics/out/`, `analytics/data/`, CSV는 `.gitignore`로 제외했다. 백업 파일, 다운로드 링크, SQL 원본은 Git·Jira·채팅에 올리지 않는다. 회원 번호가 들어 있으므로 팀 공유는 집계 결과만 한다.
- **작업이 끝나면 지운다.** 로컬 백업 파일, 복원한 컨테이너·DB, `analytics/out/`의 결과 파일을 모두 삭제한다.
- 시각은 DB에 UTC로 저장되고, 쿼리 결과의 날짜·시간은 모두 한국 시간이다. 각 쿼리가 `SET time_zone = '+00:00'`으로 시작하므로 DB 설정과 관계없이 같은 결과가 나온다.

## 준비

- Docker, MySQL 8.4 이미지
- Python 3.11 이상 (표준 라이브러리만 사용)
- 비밀번호는 `ANALYTICS_MYSQL_PASSWORD` 환경변수로 넘긴다. 명령줄이나 출력에 남지 않는다.

```powershell
$env:ANALYTICS_MYSQL_PASSWORD = '<로컬 분석용 임의 비밀번호>'
docker run -d --name ontop-analytics-mysql --network none -e MYSQL_ROOT_PASSWORD=$env:ANALYTICS_MYSQL_PASSWORD mysql:8.4
```

`--network none`으로 컨테이너를 외부·다른 컨테이너와 분리한다. 쿼리는 `docker exec`로 실행하므로 네트워크가 없어도 된다.

## 쿼리 검증 (가짜 데이터)

`scripts/seed.py`의 작은 시나리오(사용자 5명, 경기 4개(로그 없는 경기·시작 거절 포함), 기권·시작 전 이탈·구매·막힘, 붕어빵 8판, 소리함 5건과 답변 4건, 지갑 원장 54건(공동 한도 1000냥 뒤 하루 포함), 점프맵 7회(새 공원 10단계 코스 포함)·룰렛 5판·추첨 3장·두더지 4판·스피드 두더지 4판·플러스마이너스 3판·꼬치 협동 2판(VR·PC)·뽑기 영수증 10건·과일 땡 종 기록 4건 포함)를 넣고, 손으로 계산한 정답과 쿼리 결과를 비교한다. 백엔드의 실제 마이그레이션(회원 V1, 지갑 V4, 행동 로그 V5·V6, 붕어빵 V110, 소리함 V127, 경기 V112·V122·V123, 붕어빵 V111·V124·V132, 점프맵 V131·V141·V167·V179, 룰렛 V136·V164, 추첨 V140, 플러스마이너스 V143, 꼬치 협동 V145·V156, 두더지 V147·V149·V150, 스피드 두더지 V151, 뽑기 V157·V159, 소리함 답변 V158)으로 테이블을 만들기 때문에 테이블 구조가 바뀌면 여기서 먼저 깨진다. **쿼리를 고치면 반드시 다시 실행한다.**

```powershell
python analytics/scripts/verify.py --container ontop-analytics-mysql
```

`PASS`가 쿼리 수만큼 나오고 마지막 줄이 `모두 통과`여야 한다. 검증용 DB(`analytics_verify`)는 실행할 때마다 새로 만든다.

## 실제 데이터 분석

행동 로그 테이블은 운영 앱이 V5·V6 마이그레이션과 로그 활성화를 마친 뒤의 백업에만 들어 있다.

## 관리자 집계 API (S15P31B105-234)

앞서 수집한 `behavior_events`를 01·17·18번 쿼리로 **격리 복원본에서** 집계한다. 01번은 일별 활성·신규·접속·경기 참여, 17번은 가입일 코호트의 단계별 도달 인원, 18번은 시작일별 게임 수·종료·기권·참가자·경기 시간을 제공한다. 17번은 가입 이후 백업 시점까지 도달 여부를 세므로 과거 가입일 수치도 다음 백업에서 증가할 수 있다. 18번은 행동 로그의 `GAME_STARTED`/`GAME_ENDED`를 사용하는 테이블 게임 집계다. 붕어빵 전용 `minigame_sessions` 지표는 운영 공통 마이그레이션을 적용한 뒤 별도 확장한다.

백업을 위 절차에 따라 SHA-256 확인 후 네트워크가 분리된 MySQL에 복원하고 다음 명령으로 집계 파일을 만든다. DEV에서는 DEV 백업을 격리 복원하여 같은 명령을 실행한다. 환경 간 데이터 파일을 섞지 않는다.

```powershell
python analytics/scripts/export_admin_snapshot.py --container ontop-analytics-mysql --database ontop_snapshot --backup-name $archive
```

`$archive`는 실제 복원한 `ontop-dev-YYYYMMDDTHHMMSSZ.sql.gz` 또는 `ontop-prod-YYYYMMDDTHHMMSSZ.sql.gz` 파일 이름이다. 생성된 `analytics/out/admin-summary.json`에는 날짜·게임 코드·집계 수와 `dataAsOf`(백업 시각), `generatedAt`(집계 생성 시각)만 있다. 원본 이벤트, 회원 번호, 위치는 없다. 쿼리나 검증이 실패하면 기존 집계 파일을 교체하지 않는다. 집계 파일도 저장소에 올리지 않는다.

배포 서버에는 **집계 JSON만** 옮긴다. DEV는 `/etc/ontop/dev-app/analytics`, PROD는 `/etc/ontop/prod-app/analytics`에 게시한다. 각 서버에서 관리자 권한으로 다음을 실행한다. `SOURCE_JSON`은 전송해 둔 집계 파일의 절대 경로이고, `TARGET_DIR`은 환경별 위 경로다. 백업 원본은 앱 서버에 전송하지 않는다.

```bash
sudo install -d -o root -g 10001 -m 0750 "$TARGET_DIR"
sudo install -o root -g 10001 -m 0640 "$SOURCE_JSON" "$TARGET_DIR/.admin-summary.json.tmp"
sudo mv -f -- "$TARGET_DIR/.admin-summary.json.tmp" "$TARGET_DIR/admin-summary.json"
```

Compose는 해당 디렉터리를 앱 컨테이너의 `/run/ontop/analytics`에 읽기 전용으로 연결한다. 새 앱 이미지를 배포하면 `GET /api/v1/admin/analytics/summary`가 현재 게시된 집계 전체를 반환한다. 관리자 조회 권한(`ADMIN_READ_IDS`)이 필요하며, 로그인 전 401·일반 회원 403·파일이 없거나 손상되면 503이다. 응답은 `Cache-Control: no-store`다. 최초 배포 시 집계 파일이 없어도 앱은 정상 기동하며 이 API만 503을 반환한다. 파일을 게시한 뒤에는 앱 재시작 없이 다음 요청부터 새 집계가 보인다. 운영 백업이 매일 KST 03:00에 생성되더라도 위 생성·게시 단계를 실행하지 않으면 화면 데이터는 갱신되지 않는다. 자동 게시 작업은 별도 운영 절차가 필요하다.

API 필드: `daily[]`에는 `date`, `activeUsers`, `newUsers`, `connections`, `players`; `funnel[]`에는 `date`, `onboarded`, `channelJoined`, `tableJoined`, `gameStarted`, `gameCompleted`; `games[]`에는 `date`, `gameCode`, `started`, `ended`, `completed`, `forfeits`, `participants`, `durationSeconds`, `timedGames`가 있다. 기간 선택과 비율 계산은 이후 관리자 화면 작업(S15P31B105-235)에서 이 합산 가능한 정수를 사용한다.

**1. 백업 받기와 체크섬 확인**
[infra/prod-db/README.md](../infra/prod-db/README.md) 절차대로 최신 `.sql.gz`와 같은 이름의 `.sha256`을 `analytics/data/`에 받는다(Git 제외 경로). 체크섬이 다르면 사용하지 않고 다시 받는다.

```powershell
$archive = 'ontop-prod-YYYYMMDDTHHMMSSZ.sql.gz'
$expected = (Get-Content -LiteralPath "analytics/data/$archive.sha256" -Raw).Trim().Split(' ')[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath "analytics/data/$archive").Hash
if ($actual -ine $expected) { throw 'Backup SHA-256 mismatch' }
```

**2. 네트워크 분리 컨테이너에 복원** (위 "준비"의 `--network none` 컨테이너)

```powershell
docker exec ontop-analytics-mysql sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysqladmin -uroot create ontop_snapshot'
docker cp "analytics/data/$archive" ontop-analytics-mysql:/tmp/backup.sql.gz
docker exec ontop-analytics-mysql sh -c 'gunzip -c /tmp/backup.sql.gz | MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot ontop_snapshot && rm /tmp/backup.sql.gz'
```

Windows PowerShell 5.1은 작은따옴표 안의 큰따옴표를 외부 프로그램에 넘길 때 지운다. 그래서 위 명령은 안쪽에 큰따옴표가 없게 작성했다. 비밀번호는 컨테이너 안의 환경변수로만 전달된다.

**3. 쿼리 실행**

```powershell
# 쿼리 하나를 표로 보기
python analytics/scripts/run.py --container ontop-analytics-mysql --database ontop_snapshot 02_new_user_funnel.sql

# 전체를 analytics/out/*.csv로 저장 (Excel에서 한글이 깨지지 않게 저장)
python analytics/scripts/run.py --container ontop-analytics-mysql --database ontop_snapshot --all --csv
```

### 두더지 내부 집계에서 확정 회원 제외

같은 환경의 서버 로그에서 `mole_honeypot_hit` 기록을 확인한다. 로그의 `game`, `roundId`, `userId`를
운영자만 접근할 수 있는 `analytics/data/mole-review.csv`에 옮기고, 검토를 마친 판을 `CONFIRMED`로 표시한다.
검토 중인 판은 `PENDING`, 제외하지 않기로 한 판은 `REJECTED`로 표시한다.

```csv
game,round_id,user_id,status
whack-a-mole,123,101,CONFIRMED
speed-mole,456,102,PENDING
```

같은 환경에서 추출한 서버 로그를 `analytics/data/mole-honeypot.log`에 둔다. 원본 텍스트 로그나
`mole_honeypot_hit` 메시지만 한 줄씩 추출한 파일을 쓸 수 있다. 아래 명령은 확정 행의 게임·판·회원이
로그와 복원 DB의 정산 판에 모두 일치할 때만 해당 회원의 판을 두 집계에서 제외한다.

```powershell
python analytics/scripts/run.py --container ontop-analytics-mysql --database ontop_snapshot --mole-review analytics/data/mole-review.csv --mole-honeypot-log analytics/data/mole-honeypot.log --csv 28_mole_daily.sql 34_speed_mole_daily.sql
```

결과는 `analytics/out/*-reviewed.csv`에 저장된다. 판정 옵션 없이 실행하면 기존 집계가 나온다.
두더지 일별 집계(28번·34번)에만 이 판정을 적용한다. 운영 DB, 공개 랭킹, 지갑 원장과 공통 엽전 집계에는
기존 경로를 사용한다. 판정 CSV와 서버 로그는 운영자 권한으로 보관하고, 분석 결과에는 회원 ID를 포함하지 않는다.

**4. 작업 후 삭제**
팀에 공유할 집계값을 정리한 뒤 컨테이너(복원 DB 포함), 백업 파일, 결과 파일을 지운다.

```powershell
docker rm -f ontop-analytics-mysql
Remove-Item -LiteralPath "analytics/data/$archive", "analytics/data/$archive.sha256"
if (Test-Path analytics/out) { Remove-Item -Recurse -Force analytics/out }
```

## 지표

| 파일 | 지표 | 개선에 쓰는 방법 |
| --- | --- | --- |
| `00_data_quality.sql` | 한국 시간 1시간 단위 이벤트·사용자·좌표 수 | 갑자기 0이 되는 시간대는 서버 중단·로그 유실 의심 구간이다. 다른 지표를 해석할 때 그 구간을 뺀다 |
| `01_daily_active.sql` | 날짜별 활성 사용자, 신규 가입, 접속 수, 경기 참여자 | 일별 추이와 이벤트·공지 효과 |
| `02_new_user_funnel.sql` | 가입 → 채널 입장 → 착석 → 경기 시작 → 경기 완주 | 비율이 크게 떨어지는 단계에 안내·UI 개선을 집중한다 |
| `03_retention.sql` | 가입일별 D1·D7 재방문 | 아직 D7이 오지 않은 가입일은 해석에서 뺀다 |
| `04_connection_sessions.sql` | 날짜별 접속 시간 평균·중앙값(분) | 평균과 중앙값 차이가 크면 소수의 장시간 사용자가 평균을 끌어올린 것이다 |
| `05_table_wait.sql` | 착석 후 경기 시작까지 대기, 시작 전 이탈 비율, 그중 끊김·태블릿 방장 시작 만료(120초)로 빠진 수 | 이탈이 많고 대기가 길면 매칭·대기 화면 개선이 필요하다. 방장 만료가 많으면 시작 버튼 안내를 점검한다 |
| `06_game_summary.sql` | 게임별 시작·종료 수, 완주율, 평균 경기 시간, 기권 비율 | 기권이 많은 게임은 규칙·시간 제한을 점검한다 |
| `07_social.sql` | 날짜별 채팅·감정표현, 아무도 못 들은 채팅 비율 | 못 들은 채팅이 많으면 채팅 반경(20m)이나 사람 밀도를 점검한다 |
| `08_shop.sql` | 아이템별 구매·구매자·수량·장착 | 금액은 원장(`wallet_transactions`)이 원본이다 |
| `09_position_heatmap.sql` | 5m 격자별 이동량·멈춘 곳 | 사람이 몰리는 곳과 비어 있는 곳으로 배치를 조정한다 |
| `10_stuck_points.sql` | 이동 중인데 1초에 0.5m도 못 움직인 지점 | 많이 모이는 격자는 충돌·지형 버그 후보다. 맵 담당에게 좌표와 함께 전달한다 |
| `11_zone_traffic.sql` | 구역별 방문자·이동량·멈춘 곳 | 구역 정의는 파일 안의 목록을 고친다 |
| `12_minigame_daily.sql` | 날짜·판 버전별 붕어빵 판 수·이용자·완료·포기·기한 초과·기록 거절, 판 길이, 평균 점수·시간, 보상 | 포기·기한 초과가 많으면 조작 난이도나 판 길이를 점검한다. 판 길이가 다른 버전끼리는 점수를 직접 비교하지 않는다 |
| `13_minigame_daily_cap.sql` | 날짜별 미니게임 보상 수령자, 그날 공동 일일 한도(500 → 2026-11-13부터 1000), 도달자 비율, 출처별(붕어빵·점프맵·꼬치·두더지·순위 보상) 보상 | 도달 비율이 높으면 한도가 낮아 더 할 이유가 없을 수 있다. 한도·보상량 조정 근거로 쓴다 |
| `14_feedback_daily.sql` | 날짜별 소리함 제출 수·제출자 수, 답변 달린 비율·첫 답변까지 걸린 시간, 처리 상태(해결·확인 중·미처리) | 공지·업데이트 직후 제출이 늘었는지, 답변이 밀리지 않는지 본다. 의견·답변 본문은 읽지 않는다 |
| `15_feedback_channels.sql` | 채널별 소리함 제출 수·제출자 수 | 특정 채널에 제출이 몰리면 그 채널의 문제를 의심한다 |
| `16_facility_usage.sql` | 시설별 이용 횟수·이용자·평균 이용 시간, 연결 끊김 종료, 종료 기록 없는 이용 | 안 쓰이는 시설은 위치·안내를 점검하고, 연결 끊김 종료가 많으면 자리 비움 점유를 의심한다 |
| `17_dashboard_funnel_daily.sql` | 가입일 코호트별 채널·착석·경기 단계 도달 인원 | 관리자 화면에서 날짜 범위를 합산해 퍼널을 본다 |
| `18_dashboard_game_daily.sql` | 경기 시작일별 게임 수·기권·참가자·경기 시간 | 관리자 화면에서 게임별 완주·기권 비율을 본다 |
| `19_economy_daily.sql` | 날짜·원장 유형별 거래 수·사용자·들어온/나간 엽전·순증감, 날짜별 합계(ALL) | ALL의 순증감이 그날 새로 풀린 엽전이다. 계속 크게 양수면 보상이 소비처보다 많아 엽전 가치가 떨어진다. 상점·추첨 가격, 입장료, 보상량 조정 근거로 쓴다 |
| `20_wallet_balances.sql` | 백업 시점 활성 회원 지갑 수·잔액 합계·평균·중앙값·최대, 상위 10% 보유 비중, 예약 중 금액 | 상위 비중이 높으면 소수에게 엽전이 쏠린 것이다. 판돈 상한·보상 한도를 점검한다 |
| `21_bet_amounts.sql` | 게임별 판돈(1인 참가비) 최소·평균·최대, 판 평균 총액 | 대부분 최소 금액이면 판돈 기능이 거의 쓰이지 않는 것이다. 판돈 기본값·범위 조정에 쓴다 |
| `22_game_log_coverage.sql` | 날짜·게임별 시작 시도·거절·확정 경기와, 그중 시작·종료 행동 로그가 있는 경기 수·비율 | 비율이 100% 아래인 날은 로그가 빠졌거나 꺼진 구간이다. 그 날의 06·18번은 23번과 함께 본다. 거절이 많으면 잔액 부족 안내를 점검한다 |
| `23_game_results.sql` | 경기 테이블 기준 게임·종료 사유별 경기 수·평균 시간·참가자·기권·이탈 사유·정산 완료 | 로그와 무관한 원본 수치다. 기권·연결 끊김이 많은 게임은 규칙·시간 제한·재접속 흐름을 점검한다 |
| `24_jumpmap_daily.sql` | 날짜별 점프맵 도전·도전자·완주·완주율·평균 통과 구간·종료 사유·진행 중·최고/평균 완주 시간·지급 엽전·의심 판 | 완주율이 낮고 낙하·호수 착수가 많으면 난도를 점검한다. 의심 판이 늘면 이동 검증을 점검한다 |
| `25_jumpmap_gates.sql` | 코스 버전·구간별 도달 수, 도달 비율, 직전 구간 대비 이탈 | 이탈이 몰리는 구간이 가장 어려운 곳이다. 10번 막힘 지점과 함께 맵 담당에게 전달한다 |
| `26_rps_roulette_daily.sql` | 날짜별 가위바위보 룰렛 판·참가자·참가비(10·20·30)별 판 수·지급 판·지급 합계·참가비 대비 지급 비율·엽전 흡수량, 끝난 판의 결과(첫 대결 패배·도전 실패·바로 받기·1회/2회 도전 뒤 받기) | 흡수량(참가비 − 지급)이 계속 양수면 엽전을 거둬들이는 소비처로 동작한다. 표본이 적으면 운에 흔들리므로 여러 날을 합쳐 본다 |
| `27_raffle_rounds.sql` | 주간 추첨 회차별 판매 상태·티켓 가격·판매 수·구매자·1인 평균/최대·한도 도달자·사용 엽전 | 1인 최대가 주간 한도에 자주 닿으면 한도를 점검한다. 판매가 적으면 가격·안내를 점검한다 |
| `28_mole_daily.sql` | 날짜·규칙 버전별 두더지 판·참가자·정산/만료/진행 중, 평균·최고 점수, 콤보·잡은 수, 계산·지급 보상, 한도에 깎인 엽전 | 깎인 엽전이 크면 공동 한도에 걸린 사람이 많다. 규칙마다 점수 기준(30·45·40점당 1냥)이 달라 같은 규칙끼리만 점수로 난이도를 비교한다 |
| `29_plus_minus_daily.sql` | 날짜별 플러스마이너스 판·참가자·꽝/지급/잭팟, 참가비·지급 합계, 지급 비율, 엽전 흡수량 | 흡수량이 계속 음수면 엽전을 푸는 쪽으로 동작한다. 잭팟 한 번에 크게 흔들리므로 여러 날을 합쳐 본다 |
| `30_skewer_coop_daily.sql` | 날짜·조작 방식(PC·VR)별 꼬치 협동 판·참가자, 팀 점수·서빙 수·경기 시간, 시간 종료/중도 종료, 랭킹 인정, 계산·지급 보상 | 중도 종료가 많으면 2인 매칭·역할 분담 흐름을 점검한다 |
| `31_client_performance.sql` | 날짜·기기(desktop/mobile)·GPU 제조사별 1분 성능 보고 수·회원 수·평균 fps·평균 p95·느린 프레임(50ms 초과) 비율·fps 30 미만 보고 비율 | fps 30 미만 비율이 높은 기기·GPU 조합부터 품질 기본값과 그리기 비용을 점검한다. 보고가 없는 날은 클라이언트 로그 배포 전이다 |
| `32_welcome_tour_funnel.sql` | 첫 입장 체험 투어 단계별 마친 회원·그 단계에서 그만둔 회원(다시 보기 제외) | 그만둔 회원이 몰린 단계의 안내 문구·목표를 점검한다. flight에서 많이 나가면 환영 비행이 길다는 신호다 |
| `33_gacha_daily.sql` | 날짜별 의상 뽑기권 구매·캡슐 뽑기·등급별 결과·상자 열기·중복 환급, 쓴 엽전·돌려준 엽전·회수율 | 뽑기가 엽전을 얼마나 거둬들이는지(19번 엽전 과잉 대응) 본다. 중복 환급이 늘면 상품 수에 비해 뽑기가 많다는 뜻이다 |
| `34_speed_mole_daily.sql` | 날짜·규칙 버전별 스피드 두더지 판·참가자·정산/미정산, 평균·최고 점수, 평균 적중·실수, 적중률, 계산·지급 보상, 한도에 깎인 엽전 | 기존 두더지(28번)와 다른 60초 게임이라 점수를 섞어 비교하지 않는다. 적중률이 낮으면 빈 구멍을 많이 친 것이다. 깎인 엽전이 크면 다른 미니게임으로 이미 한도를 채운 사람이 많다 |
| `35_halli_bell_reaction.sql` | 회원별 과일 땡 경기 수, 맞힌·틀린·늦은 종, 먼저 친 비율, 맞힌 종의 최소·평균 반응 시간, 150·300ms 미만 비율 | 사람은 카드를 보고 과일 수를 세느라 보통 0.4초 이상 걸린다. 150ms 미만 비율이 높고 틀린 종이 거의 없으면 기계적으로 친 것으로 의심한다. 반응 시간에는 통신 시간이 들어간다. 2026-11-12 배포 전 경기는 기록이 없다 |

해석할 때 주의할 점:
- 회원 번호가 없는 이벤트(local 개발 사용자)는 사용자 지표에서 빠진다. 팀원 테스트 계정은 아직 걸러내지 않는다.
- 로그를 켜기 전에 시작된 경기·접속은 짝이 맞지 않아 일부 지표에서 빠진다.
- 위치는 움직이는 동안만 1초마다 기록하므로 히트맵의 이동량은 "체류 시간"이 아니라 "지나다닌 양"이다.
- 12번이 읽는 `minigame_sessions`·`bungeoppang_records`·`bungeoppang_v4_rounds`와 24~26번이 읽는 점프맵·룰렛 테이블은 `db/minigame` 경로의 마이그레이션이다. 2026-11-03 운영 DB의 `flyway_schema_history`에서 V129~V140(`db/minigame`·`db/notes` 포함)이 2026-11-02에 모두 `success=1`로 적용된 것을 확인했다. 따라서 그 이후 운영 백업에서는 0~27번이 모두 동작한다. 그보다 이전 백업에는 해당 테이블이 없어 그 쿼리가 실패한다. 저장소의 `infra/app/prod.app.env.example`(`DB_MIGRATION_LOCATIONS=classpath:db/migration`)은 실제 운영 설정과 다르므로, 경로를 판단할 때는 운영 DB의 `flyway_schema_history`를 기준으로 한다. 14~15번이 읽는 `feedback_messages`는 2026-10-27부터 공통 마이그레이션 V127로 옮겨졌지만, V127이 배포되기 전 백업에는 테이블이 없다.
- 붕어빵 판 버전(12번 `game_version`)은 v2, `v4-20261027.1`(60초), `v5-20261027.1`(3분, 10/29 이전 발급 판), `v5-20261029.1`(2분)이다. v2는 제출 기한 10분이 지나면 기한 초과다. 일일 보상 한도는 버전과 관계없이 같다. 12번 평균 시간은 사용자가 직접 멈춘 시간(V132 `manual_paused_ms`)을 뺀 값이다.
- 서버가 90일 지난 소리함 제출을 지우므로, 소리함 지표는 지워지기 전 백업으로 본다. 탈퇴하면 작성자 회원 번호가 지워진다.
- 쿼리는 백업 한 건을 기준으로 한다. 여러 백업을 합쳐 보면 같은 행이 겹치므로 각 테이블의 `id`로 중복을 지운 뒤 집계한다.
- 익명 메모(`anonymous_notes`)는 행동 로그를 남기지 않기로 했다(S15P31B105-212). 서버가 최신 120개만 남기고 지우므로 `created_at`으로 센 건수는 남아 있는 메모 기준이며, 전체·일별 작성 수로 해석하지 않는다.
- 붕어빵 12번은 판 시작일, 13번은 원장 지급 시각 기준이라 자정 근처의 판은 두 쿼리에서 날짜가 다를 수 있다.
- 19~20번은 지갑 원장(`wallet_transactions`)과 지갑(`wallets`)을 읽는다. 금액은 이 원장이 원본이며 행동 로그 금액보다 우선한다. 20번은 백업 시점 한 장면이라 날짜별 추이는 백업 여러 건을 따로 돌려 비교한다. 회원별 잔액 목록은 만들지 않는다.
- 21번은 행동 로그 `GAME_STARTED` 기준이라 로그를 켜기 전 경기는 빠진다. 2026-11 이후 판돈 0 경기(V139)가 허용되어 최소 판돈이 0일 수 있다. 판돈 0 경기도 예약·정산 원장이 금액 0으로 남으므로 19번의 경기 원장 거래 수에는 잡히지만 엽전 흐름에는 영향이 없다.
- 13번의 공동 일일 한도는 2026-11부터 붕어빵 단독 100냥에서 미니게임 공동 500냥(`MinigameRewardBudget.DAILY_CAP`)으로 바뀌었다. 서버처럼 지갑 원장의 `MINIGAME_REWARD`(붕어빵)·`JUMP_GATE_REWARD`(점프맵)·`SKEWER_REWARD`(꼬치)·`MOLE_REWARD`(두더지, 2026-11-05 추가) 양수 금액을 KST 하루로 합산한다. 스피드 두더지(V151)도 같은 `MOLE_REWARD`로 지급하므로 한도 계산에는 그대로 들어가고, 출처 열은 원장 키로 `mole_rewards`(`mole:reward:<판>`)와 `speed_mole_rewards`(`mole:reward:speed:<판>`)로 나눈다. 이 변경 전 날짜의 도달 비율은 당시 한도(100)와 다르게 보인다. 한도는 2026-11-12(dev)·2026-11-13(운영) 배포로 1000냥이 됐고(465e417b), 쿼리의 `caps` 표에 바뀐 날짜부터의 한도를 적어 그날 한도로 도달을 센다. 운영 배포 날(11/13)은 오후부터 1000냥이라 그날 오전에 500냥에 걸린 사람은 도달로 세지 않는다. DEV 백업이면 `caps`의 날짜를 11/12로 바꿔 쓴다. 돌탑 생존전 순위 보상(`GAME_RANK_REWARD`, 2026-11-15 dev)도 같은 한도에 들어가 `rank_rewards` 열로 따로 보인다.
- 19번에 새로 보이는 원장 유형: `MINIGAME_ENTRY_FEE`(가위바위보 룰렛·꼬치 입장료, 출처는 `idempotency_key` 접두어 `rps-roulette:`·`skewer:`), `RPS_ROULETTE_PAYOUT`(룰렛 지급), `RAFFLE_PURCHASE`(주간 추첨 구매), `FITNESS_REWARD`(운동기구 보상 1냥), `JUMP_GATE_REWARD`(점프맵 구간 보상), `MOLE_REWARD`(두더지·스피드 두더지 보상. 출처는 `idempotency_key` 접두어 `mole:reward:speed:`로 가른다), `PLUS_MINUS_PAYOUT`(플러스마이너스 지급, 참가비는 `MINIGAME_ENTRY_FEE`), `ADMIN_BULK_GRANT`(관리자 일괄 지급, V142). 관리자 지급은 이벤트·보상 지급이라 엽전 흐름(ALL 순증감)을 해석할 때 따로 빼고 본다.
- 22~23번은 경기 테이블(`game_sessions`·`game_participants`, 공통 마이그레이션 V112·V122·V123)을 읽는다. 행동 로그의 `game_id`는 `game_sessions.id`와 같은 값이다. 경기 수·결과의 원본은 이 테이블이다.
- 24~27번은 점프맵(`jump_runs`, `db/minigame` V131)·가위바위보 룰렛(`rps_roulette_rounds`, `db/minigame` V136)·주간 추첨(`raffle_rounds`·`raffle_tickets`, 공통 V140) 기능 테이블을 읽는다. 행동 로그는 따로 남기지 않는다. 운영 DB에는 2026-11-02에 적용됐으므로 그 이전 백업에서는 24~27번과, 새 공원 점프 도전 시간을 함께 보는 11번이 실패한다.
- 점프맵 구간 보상(`JUMP_GATE_REWARD`)은 도전 1회 최대 250냥(V141), 220m 새 공원 10단계 코스부터 500냥(V179)이고, 하루 한도는 미니게임 공동 한도(13번, `JumpmapStore.DAILY_CAP = MinigameRewardBudget.DAILY_CAP`)를 쓴다. `jump_daily_earnings`는 한도 판단에 쓰지 않는다. 25번은 끝난 도전 중 의심 판을 뺀 것만 센다.
- 28~30번은 두더지(`mole_rounds`, V147)·플러스마이너스(`plus_minus_rounds`, V143)·꼬치 협동(`skewer_coop_results`·`skewer_coop_rewards`, V145) 기능 테이블을 읽는다(모두 `db/minigame`). 운영 DB에는 2026-11-05 기준으로 적용 여부를 `flyway_schema_history`에서 확인한 뒤 백업을 분석한다.
- 25번은 코스(`course_version`)별로 나누므로 새 공원 10단계 코스(`park220-jump10-v1`, V167)는 기존 7단계 코스와 따로 나온다. 새 코스 보상은 처음 단계별 5~40냥(완주 250냥)이었다가 2026-11-15 다시 올린 판부터 10~80냥(완주 500냥, V179로 한 판 최대 500냥)이다. 25번은 단계 통과 수만 세므로 보상이 바뀌어도 그대로이고, 보상 합계는 13·19번에서 본다.
- 30번의 `play_mode`는 V156(`db/minigame`)에서 생겼고, 14번 답변 지표는 V158(`feedback_replies`·`feedback_messages.status`), 33번은 V157·V159(`gacha_receipts`), 34번은 V151(`speed_mole_rounds`, `db/minigame`) 뒤의 백업에서만 동작한다.
- 26번 룰렛은 V164(`db/minigame`)에서 도전 배수가 ×1.0/×1.5/×2.0 → ×1.0/×2.0/×4.0으로, 룰렛판 평균 칸 값이 61/30 → 68/30으로 바뀌었다. 판 기록에 규칙 버전이 없으므로 운영 `flyway_schema_history`의 V164 `installed_on` 전후로 날짜를 나눠 본다. 비기면 다시 겨루므로 한 번 이길 확률은 1/2이다. 이전 규칙의 기대 지급률은 바로 받기 102%·한 번 도전 76%·두 번 도전 51%였고, V164 뒤에는 어느 쪽을 골라도 113%다. 즉 V164 뒤의 룰렛은 평균적으로 엽전을 거둬들이지 않고 푼다(흡수량이 음수로 나오는 것이 정상).
- 분석용 백업에는 이벤트 당첨자 연락처(`event_winner_contacts`, V153)와 연락처 열람 기록(`event_contact_access_audit`, V155)이 필요 없다. 백업을 요청할 때 이 테이블을 빼 달라고 하고, 들어 있으면 복원 직후 지운다.

## 구역 수정

`11_zone_traffic.sql`은 두 목록으로 구역을 정한다.

- `layouts`: 좌표 표본의 `map_version`(서버 맵 해시)을 맵 배치에 연결한다. 기존 맵(`legacy`)은 `544bc6fa…`·`ae833248…`, 새 생성 맵(`generated`)은 `cac3cb04…`·`04350122…`·`c05d8ada…`(2026-11-03 운영 전환 후보), `de8b51d7…`(2026-11-13 점프맵 입구를 복구해 다시 만든 같은 배치), 220m 새 공원(`renewal`)은 `b1a69e7d…`(!492, 2026-11-10~11 DEV)·`01e3e6d1…`(2026-11-15 DEV에 다시 올린 판)다. 이전 두 후보는 배포되지 않아 최신 좌표를 그대로 쓴다. 여기에 없는 버전은 다른 맵 구역에 섞지 않고 `unmapped`로 센다.
- `zones`: 배치별 구역 정의다. `legacy`는 `frontend/src/config`의 `PARK_ZONES`, `PARK_PAVILIONS`, `PICNIC_TABLES`(2026-10-23 기준, 2026-10-30 재확인), `generated`는 `frontend/src/map/park/definition.ts`(2026-10-30 기준) 좌표를 옮겼다. 반경·크기는 분석용으로 정한 값이다. 생성 맵의 돌탑 점프맵은 공중을 지나가므로 높이 5m 이상(`min_y`)은 `jump-course`로 센다. `renewal`은 `frontend/park-renewal-preview/plan.ts`의 `SITES` 중심·반경(2026-11-15 기준, 예전 `frontend/src/park-renewal/plan.ts`와 같은 배치)을 그대로 쓰고, 소리함만 게임 안 위치(`frontend/generated/park-renewal/server-map.json`의 `feedback-mailbox`)를 쓴다. 공사 중 시설도 구역으로 둔다. 새 공원의 10단계 코스는 언덕과 호수 위를 가로질러 높이로 가를 수 없으므로, 그 회원의 점프맵 도전 시간(`jump_runs` 시작~종료, 진행 중이면 시작 후 30분) 안의 표본을 `jump-course`로 센다.

맵이 바뀌면 이렇게 고친다.

1. 결과에 `unmapped`가 보이면 `SELECT map_version, MIN(sampled_at), MAX(sampled_at), COUNT(*) FROM world_position_samples GROUP BY map_version;`으로 새 버전과 쓰인 기간을 찾는다.
2. 배포된 맵이 무엇인지 확인한다. 기존 맵의 버전은 `backend/src/main/resources/world/park.json`의 `sourceSha256`, 생성 맵은 배포 담당(S15P31B105-273)이 알려 준 맵 파일의 `mapVersion`이다. 충돌만 고친 기존 맵이면 `legacy`, 새 생성 맵이면 `generated`로 `layouts`에 한 줄 추가한다. 생성 맵은 다시 만들 때마다 해시가 바뀐다. 새 공원은 2026-11-15부터 서버가 `frontend/generated/park-renewal/server-map.json`을 읽고(Jenkinsfile의 `PARK_MAP_HOST_DIR`), 맵 버전은 같은 폴더 `manifest.json`·`server-map.json`의 `mapVersion`이다. 맵을 다시 만들어 커밋하면 바뀌므로 그 값을 `renewal`로 추가한다. (11/10~11의 첫 판은 DEV `release.json`의 버전을 썼다.) 좌표 계약이 그대로면 `zones`는 고치지 않는다.
3. 장소 배치가 바뀌었으면 그 배치의 `zones`를 고친다. 목록만 고치면 과거 좌표도 다시 집계된다.
4. `verify.py`의 `11_zone_traffic.sql` 기대값을 확인한다.

## 성능

로컬 MySQL 8.4에서 위치 50만 행 기준 히트맵 0.7초, 구역 4.0초, 막힘 지점 4.9초였다. 새 공원 점프 구간 판정을 넣은 뒤 구역(11번)은 새 공원 표본 50만 행·도전 1,500판에서 5.3초였다. 표본마다 도전 판을 찾던 첫 방식(상관 서브쿼리)은 같은 데이터에서 96초가 걸려, 회원별 시간순 누적 합으로 바꿨다. 한 달 최대치(약 1,000만 행)는 1~2분 걸릴 것으로 예상한다. 그래서 운영 DB가 아닌 복원본에서 실행한다.
