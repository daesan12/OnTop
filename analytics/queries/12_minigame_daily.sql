-- 한국 날짜(판 시작 기준)·판 버전별 붕어빵 판 수, 이용자, 완료·포기·기한 초과·기록 거절·진행 중 판 수,
-- 완료율, 평균 점수·시간, 보상 합계. 행동 로그가 아닌 기능 테이블(minigame_sessions)을 읽는다.
-- 판 버전은 v4·v5 판의 설정 버전(bungeoppang_v4_rounds.config_version)이고, v2 판은 규칙 버전(v2)이다.
-- 버전마다 판 길이가 달라 점수·시간을 한데 섞으면 비교할 수 없으므로 나눈다.
--   v2: 시작 후 60초부터 제출, 10분 안에 제출하지 않으면 기한 초과
--   v4-20261027.1: 60초 / v5-20261027.1: 3분(10/29 이전 발급 판) / v5-20261029.1: 2분
-- play_seconds는 v4·v5 판에 저장된 실제 조리 시간(초)이다. v2는 판 테이블이 없어 NULL이다.
-- INVALID는 기한 초과(expired)와 입력 기록 거절(rejected, v2만 해당)로 나눈다.
-- 포기(ABANDONED)에는 새 판을 시작해 이전 판이 끝난 경우도 들어간다.
-- 평균 점수·시간은 완료한 판만 계산하고, 시간은 시작 요청부터 완료 처리까지다(카운트다운 포함).
-- 보상은 시작일에 묶으므로 일일 한도 계산(13번, 종료일 기준)과 날짜가 다를 수 있다.
SET time_zone = '+00:00';

WITH sessions AS (
    SELECT s.user_id,
           s.status,
           s.score,
           s.reward_amount,
           s.started_at,
           s.ended_at,
           COALESCE(r.config_version, b.rules_version, 'unknown') AS game_version,
           TIMESTAMPDIFF(SECOND, r.play_starts_at, r.play_ends_at) AS play_seconds,
           b.rejection_detail IS NOT NULL AS rejected
    FROM minigame_sessions s
    LEFT JOIN bungeoppang_records b ON b.minigame_session_id = s.id
    LEFT JOIN bungeoppang_v4_rounds r ON r.minigame_session_id = s.id
    WHERE s.minigame_type = 'BUNGEOPPANG'
)
SELECT DATE(started_at + INTERVAL 9 HOUR) AS kst_date,
       game_version,
       MAX(play_seconds) AS play_seconds,
       COUNT(*) AS sessions,
       COUNT(DISTINCT user_id) AS players,
       SUM(status = 'COMPLETED') AS completed,
       SUM(status = 'ABANDONED') AS abandoned,
       SUM(status = 'INVALID' AND NOT rejected) AS expired,
       SUM(status = 'INVALID' AND rejected) AS rejected,
       SUM(status = 'PLAYING') AS playing,
       ROUND(100 * SUM(status = 'COMPLETED') / COUNT(*), 1) AS completion_pct,
       ROUND(AVG(CASE WHEN status = 'COMPLETED' THEN score END), 1) AS avg_score,
       ROUND(AVG(CASE WHEN status = 'COMPLETED' THEN TIMESTAMPDIFF(SECOND, started_at, ended_at) END) / 60, 1)
           AS avg_minutes,
       SUM(CASE WHEN status = 'COMPLETED' THEN reward_amount ELSE 0 END) AS rewards
FROM sessions
GROUP BY kst_date, game_version
ORDER BY kst_date, game_version;
