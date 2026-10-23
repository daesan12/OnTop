# 행동 로그 분석

S15P31B105-178. 서버가 남기는 행동 로그(`behavior_events`, `world_position_samples`)로 서비스 개선 지표를 뽑는 쿼리와 검증 도구다. 수집 설계와 이벤트 목록은 [docs/behavior-log.md](../docs/behavior-log.md)를 따른다.

## 데이터 접근 원칙

- **운영 DB에 직접 쿼리하지 않는다.** 위치·구역 쿼리는 행 전체를 읽어서 운영 중인 게임 DB를 느리게 만들 수 있다. 인프라 담당에게 백업 파일(`ontop-prod-*.sql.gz`, 매일 KST 03:00)을 받아 로컬 MySQL 컨테이너에 복원해서 분석한다.
- **원본 데이터와 결과 파일은 커밋하지 않는다.** `analytics/out/`, `analytics/data/`, CSV는 `.gitignore`로 제외했다. 회원 번호가 들어 있으므로 팀 공유는 집계 결과만 한다.
- 시각은 DB에 UTC로 저장되고, 쿼리 결과의 날짜·시간은 모두 한국 시간이다. 각 쿼리가 `SET time_zone = '+00:00'`으로 시작하므로 DB 설정과 관계없이 같은 결과가 나온다.

## 준비

- Docker, MySQL 8.4 이미지
- Python 3.11 이상 (표준 라이브러리만 사용)
- 비밀번호는 `ANALYTICS_MYSQL_PASSWORD` 환경변수로 넘긴다. 명령줄이나 출력에 남지 않는다.

```powershell
$env:ANALYTICS_MYSQL_PASSWORD = '<로컬 분석용 임의 비밀번호>'
docker run -d --name ontop-analytics-mysql -e MYSQL_ROOT_PASSWORD=$env:ANALYTICS_MYSQL_PASSWORD mysql:8.4
```

## 쿼리 검증 (가짜 데이터)

`scripts/seed.py`의 작은 시나리오(사용자 5명, 경기 2개, 기권·시작 전 이탈·구매·막힘 포함)를 넣고, 손으로 계산한 정답과 쿼리 결과를 비교한다. 백엔드의 실제 마이그레이션(V5, V6)으로 테이블을 만들기 때문에 테이블 구조가 바뀌면 여기서 먼저 깨진다. **쿼리를 고치면 반드시 다시 실행한다.**

```powershell
python analytics/scripts/verify.py --container ontop-analytics-mysql
```

`PASS`가 쿼리 수만큼 나오고 마지막 줄이 `모두 통과`여야 한다. 검증용 DB(`analytics_verify`)는 실행할 때마다 새로 만든다.

## 실제 데이터 분석

```powershell
# 백업 복원 (파일은 analytics/data/에 두면 Git에서 제외된다)
docker exec ontop-analytics-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE ontop_snapshot"'
docker cp analytics/data/ontop-prod-YYYYMMDDTHHMMSSZ.sql.gz ontop-analytics-mysql:/tmp/backup.sql.gz
docker exec ontop-analytics-mysql sh -c 'gunzip -c /tmp/backup.sql.gz | mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ontop_snapshot'

# 쿼리 하나를 표로 보기
python analytics/scripts/run.py --container ontop-analytics-mysql --database ontop_snapshot 02_new_user_funnel.sql

# 전체를 analytics/out/*.csv로 저장 (Excel에서 한글이 깨지지 않게 저장)
python analytics/scripts/run.py --container ontop-analytics-mysql --database ontop_snapshot --all --csv
```

## 지표

| 파일 | 지표 | 개선에 쓰는 방법 |
| --- | --- | --- |
| `00_data_quality.sql` | 한국 시간 1시간 단위 이벤트·사용자·좌표 수 | 갑자기 0이 되는 시간대는 서버 중단·로그 유실 의심 구간이다. 다른 지표를 해석할 때 그 구간을 뺀다 |
| `01_daily_active.sql` | 날짜별 활성 사용자, 신규 가입, 접속 수, 경기 참여자 | 일별 추이와 이벤트·공지 효과 |
| `02_new_user_funnel.sql` | 가입 → 채널 입장 → 착석 → 경기 시작 → 경기 완주 | 비율이 크게 떨어지는 단계에 안내·UI 개선을 집중한다 |
| `03_retention.sql` | 가입일별 D1·D7 재방문 | 아직 D7이 오지 않은 가입일은 해석에서 뺀다 |
| `04_connection_sessions.sql` | 날짜별 접속 시간 평균·중앙값(분) | 평균과 중앙값 차이가 크면 소수의 장시간 사용자가 평균을 끌어올린 것이다 |
| `05_table_wait.sql` | 착석 후 경기 시작까지 대기, 시작 전 이탈 비율 | 이탈이 많고 대기가 길면 매칭·대기 화면 개선이 필요하다 |
| `06_game_summary.sql` | 게임별 시작·종료 수, 완주율, 평균 경기 시간, 기권 비율 | 기권이 많은 게임은 규칙·시간 제한을 점검한다 |
| `07_social.sql` | 날짜별 채팅·감정표현, 아무도 못 들은 채팅 비율 | 못 들은 채팅이 많으면 채팅 반경(20m)이나 사람 밀도를 점검한다 |
| `08_shop.sql` | 아이템별 구매·구매자·수량·장착 | 금액은 원장(`wallet_transactions`)이 원본이다 |
| `09_position_heatmap.sql` | 5m 격자별 이동량·멈춘 곳 | 사람이 몰리는 곳과 비어 있는 곳으로 배치를 조정한다 |
| `10_stuck_points.sql` | 이동 중인데 1초에 0.5m도 못 움직인 지점 | 많이 모이는 격자는 충돌·지형 버그 후보다. 맵 담당에게 좌표와 함께 전달한다 |
| `11_zone_traffic.sql` | 구역별 방문자·이동량·멈춘 곳 | 구역 정의는 파일 안의 목록을 고친다 |

해석할 때 주의할 점:
- 회원 번호가 없는 이벤트(local 개발 사용자)는 사용자 지표에서 빠진다. 팀원 테스트 계정은 아직 걸러내지 않는다.
- 로그를 켜기 전에 시작된 경기·접속은 짝이 맞지 않아 일부 지표에서 빠진다.
- 위치는 움직이는 동안만 1초마다 기록하므로 히트맵의 이동량은 "체류 시간"이 아니라 "지나다닌 양"이다.

## 구역 수정

`11_zone_traffic.sql` 안의 `zones` 목록이 구역 정의다. 중심 좌표는 `frontend/src/config`의 `PARK_ZONES`, `PARK_PAVILIONS`, `PICNIC_TABLES`(2026-10-23 기준)를 옮겼고, 반경·크기는 분석용으로 정한 값이다. 맵이 바뀌면 이 목록만 고치면 과거 좌표도 새 구역으로 다시 집계된다. 고친 뒤에는 `verify.py`의 `11_zone_traffic.sql` 기대값을 확인한다.

## 성능

로컬 MySQL 8.4에서 위치 50만 행 기준 히트맵 0.7초, 구역 4.0초, 막힘 지점 4.9초였다. 한 달 최대치(약 1,000만 행)는 1~2분 걸릴 것으로 예상한다. 그래서 운영 DB가 아닌 복원본에서 실행한다.
