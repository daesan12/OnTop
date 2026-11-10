# 새 공원 V167 이관본 — 2026-11-10

사용자 지정에 따라 10단계 점프맵 migration의 dev 이관 번호를 V169에서 **V167**로 변경했다. 현재 작업 위치는 `C:/Users/SSAFY/Desktop/OnTop/park-detail-220-dev-v167-local-20261110`이며, 최신 `origin/dev@56a432b2b07e900a920217d25d70993cfbb7d5df`에서 만든 로컬 detached worktree이다. 커밋·푸시·MR·머지·배포는 보류 상태다.

## 적용 파일과 범위

- 파일: `backend/src/main/resources/db/minigame/V167__extend_jumpmap_to_ten_stages.sql` 1개.
- 목적: `jump_runs.gates_passed`의 CHECK를 0~10, `jump_gate_rewards.gate`의 CHECK를 1~10으로 확장한다. 기존 판·지급·원장·유일성 제약과 단계별 보상은 유지한다.
- 기준: dev의 `V166__add_mole_ranking_index.sql` 다음에 적용한다. dev+db의 기존 Flyway locations에는 `db/migration`, `db/minigame`이 포함된다. 로컬 공원 검수 프로필은 기존처럼 `db/shop`도 포함한다.
- 이번 작업본에는 V169 SQL을 두지 않는다. 신규 migration의 SQL 본문은 이전 V169와 동일하다.

이전 `park-detail-220-local-20261108` 작업본과 V169가 적용된 `ontop_renewal_live_20261110`, `ontop_jumpmap_test_integration_20261110` DB는 보존했다. 적용된 V169 파일이나 Flyway 이력을 수정·삭제·repair하지 않았다. 이 DB들을 V167 소스에 연결하지 않는다. 이번 V167은 별도 DB에서 신규/순차 적용으로 검증했다. 실제 dev DB는 접속하거나 변경하지 않았다.

## 최신 dev 반영

기존 미커밋 공원 변경을 새 dev 기준에 이관했고, 두 파일의 변경을 3-way로 합쳤다: `SpringParkRuntime.ts`, `contractFixture.ts`. 최신 dev에서 삭제한 `ParkJumpmapRankingRepository`는 되살리지 않았다. 해당 저장소에 의존하던 로컬 점프맵 검사 한 항목을 제거했으며 실제 보상·원장 검사는 유지했다. dev의 신규 두더지 랭킹·API 변경도 보존했다.

생성 전 확인한 원격 브랜치 21개와 기존 로컬 worktree 148곳에서 V167 파일은 없었다. 당시 V169는 이전 공원 로컬 작업본 한 곳에 있었다. GitLab 열린 MR 조회는 API 401로 확인하지 못했으며, 원격에 없는 팀 예약도 확인하지 못했다. V167은 사용자의 이번 지정 번호이며 원격 반영 전에는 최신 점유와 팀 예약을 다시 확인해야 한다.

## 로컬 검증

- 새 전용 MySQL DB `ontop_jumpmap_test_dev167_20261110`에 실제 Flyway 신규 적용 성공: V166·V167 success=1, V169 없음.
- 별도 upgrade DB에서 V166 상태에 기존 7단계 데이터를 넣은 뒤 V167 순차 적용 성공. 기존 7단계 기록과 지급액 보존, 10단계 허용, 11단계 거부 확인.
- `RenewalJumpmapMySqlTests` 5개 통과: 실제 HTTP·WS·MySQL로 10단계, 동시 중복 지급 방지, 실패 롤백·재시도, 일일 상한 및 순차 적용 검사. 착지 관측은 tracker/service 경계에 주입하며 브라우저의 전 코스 물리 주행 검사는 아니다.
- 실제 점프맵 지급 원장 10건, 합계 250냥. 검수 지갑 100 → 350냥, reserved balance 0. 보상은 5·10·15·20·25·30·32·35·38·40냥으로 증가한다.
- FE 회귀 6개 파일 49개 테스트 및 `tsc --noEmit` 통과. 기존 공통 복구·좌석·VR 보호와 최신 두더지 변경을 검사했다.
- 서버 native 물리 회귀 5개 통과: 40개 출발 슬롯의 접지·첫 이동과 외곽·코스 관련 검사를 최신 dev 기준 작업본에서 확인했다.
- 기존 매핑 좌표 230개와 mapping.world 전체는 이전 작업본과 동일하다. 재생성한 FE·BE 맵 계약 버전은 `df495fdde54bff7164945248dca3c84f3a5145441f45ababc0240b12292a302a`이다. 최신 기준 커밋 반영으로 버전이 달라졌으며 에셋 좌표 이동은 없다.

## 스폰 확인

일반 공원 입장 스폰은 정문 바로 **안쪽**의 `X=0, Z=99`이다. 매핑의 Y 힌트는 4.8이며 서버는 실제 바닥에 캡슐을 접지시킨다. 최초 방향은 공원 안쪽이며 기본 PC 3인칭 카메라 앞 오른쪽에 `오늘의 운세`가 있다(`X=9, Z=90`).

기본 카메라 yaw=0, pitch=0.35, distance=6.8, FOV=52로 1440×1000·1920×1080의 대표 출발 슬롯에서 운세방 중심이 시야 범위에 드는 것을 투영 계산으로 확인했다. 이는 기본 PC 3인칭의 시야 범위 확인이며, 나무 가림이나 사용자가 회전·저장한 다른 시점까지 같은 화면을 보장하는 실기 검사는 아니다. 스폰·운세방 좌표와 카메라 설정은 이번에 변경하지 않았다. 기존 경기·시설 복귀는 해당 흐름의 복귀 규칙을 따른다.

증거는 `C:/Users/SSAFY/Desktop/OnTop/local-park-revisions/20261110-dev-v167`의 `carryover.json`, `mysql-v167.log`, `db-proof.txt`, `frontend-tests.log`, `typecheck.log`, `spawn-view.json`, mapping/backend export 로그에 보존했다. 이전 V169 검수 기록은 이전 작업 당시 결과로 유지한다.
