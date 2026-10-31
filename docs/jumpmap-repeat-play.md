# 돌탑 점프맵 반복 도전·타임어택 계약

2026-10-31 최신 사용자 피드백. 이전 v2의 호수 진입 완주·시간 랭킹 보류 지시를 대체한다.

## 진행과 시간

첫 돌(0번) 착지 → 서버 자동 시작·시간 측정 → 구간 문을 순서대로 통과 → 마지막 연잎(112번) 착지에 7구간 검사·완주 기록 확정 → 결과와 랭킹 → 계속하기/Esc로 닫고 공원 이동.

- E·준비 화면·카운트다운 없이 시작한다. 맨바닥 접지는 FALL, 완주 전 호수 진입은 LAKE로 판을 끝낸다. 타이머를 초기화하고 첫 발판으로 직접 돌아가 다시 시작한다. 낙하 안내는 1.5초만 보이고 이동·점프를 잠그지 않는다.
- 마지막 연잎에서 시간이 멈춘다. 호수 진입은 더 이상 완주 조건이 아니다. 기존 여섯 문과 속도·착지 횟수 검증은 유지하며 마지막 구간의 최소 착지 수는 다이빙을 제외한 14회(최소 시간 5,600ms)다. 검증 실패 판은 보상을 추가하지 않고 랭킹에서 제외한다.
- 시간은 서버가 확정한 밀리초다. HUD는 진행 중 초를 표시하고 결과는 소수점 세 자리 초로 표시한다. 클라이언트는 시간·기록·보상을 제출하지 않는다.
- 완료는 기존 `JUMPMAP_ENDED(reason=FINISH)`에서 한 번 연다. 중복 이벤트는 다시 열지 않으며, 새 접속에서 최근 누락된 결과는 기존 lastRun 복구 범위 안에서 한 번 보여준다. `JUMPMAP_FINAL_PAD`는 도착 상태 알림으로 유지한다.
- 지급은 [미니게임 공통 하루 500냥](minigame-shared-budget.md), 한 판 구간별 2·4·7·11·16·24·36냥은 유지한다.

## 랭킹

인증된 `GET /api/v1/minigames/jumpmap/rankings`가 상위 50명의 `items`와 요청 회원의 `me`(기록이 없으면 null)를 반환한다. 응답은 캐시하지 않는다.

각 항목은 `rank`(정수), `userId`(문자열), `nickname`, `finishMs`(정수), `finishedAt`(ISO 시각)이다. 현재 `rules_version=v3`, `course_version=park180-jump-v1`의 서버 확정 FINISH·7문·마지막 연잎·비의심 판만 개인 최고 한 건씩 뽑는다. 탈퇴 회원은 제외한다.

등수는 `RANK() OVER (ORDER BY finish_ms)`이므로 같은 기록은 공동 순위다. 표시 순서는 기록 오름차순 → 완료 시각 오름차순 → 회원 ID로 안정화한다. 동일 회원의 같은 최고 기록은 먼저 도착한 판을 유지한다. v2 호수 완주 기록과 v3 연잎 기록은 함께 경쟁하지 않는다. 기존 jump_runs 및 인덱스를 사용하며 새 Flyway는 없다.

## 작업 위치와 독립 검증

시작 기준은 origin/dev `09880192`, 추가 효과음·CI를 포함한 통합 기준은 `d8a571f0`. FE 담당 경로는 `src/features/jumpmap/`, 기존 절차형 에셋은 `src/layout-preview/jumpGeometry.ts`; BE는 `world/jumpmap/`, 기존 REST 연결은 `world/controller/JumpmapController`다. 맵 시설·테이블·충돌 좌표는 바꾸지 않는다.

frontend에서 `node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5283 --strictPort`로 실행한다. `/jumpmap-preview.html`은 실제 FE 결과/HUD에 모의 이벤트만 공급하는 독립 진입점이며 서버·지갑·실제 랭킹과 연결하지 않는다. `/park` 통합 브라우저 검사는 HTTP/WS contract fixture를 사용한다. 실제 BE 판정·복구·동시 지급·랭킹 SQL은 별도 Java 및 MySQL 8.4 검사로 구분한다.

연결 변경: FE `SpringParkRuntime`의 GET 랭킹 허용 경로, 기존 상태 projection/완료 컴포넌트; BE Controller의 읽기 전용 endpoint와 Store 조회. 신규 게임 코드·공통 WebSocket 종류·예약·지갑 정산 경로는 만들지 않는다. 서버 재시작 시 진행 판 복원은 기존처럼 보장하지 않는다.
