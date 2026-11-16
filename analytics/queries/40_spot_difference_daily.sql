-- 한국 날짜(판이 끝난 시각 기준)·난이도별 틀린 그림 찾기 판 수, 참가자, 완주·새 판으로 교체·만료, 완주율,
-- 평균 시작·완료 라운드, 평균 찾은 수·헛클릭, 지급 엽전, 가장 빨리 다 찾은 라운드 시간.
-- 행동 로그 GAME_PLAY_STATS(gameCode SPOT_DIFFERENCE, S15P31B105-447)를 읽는다. 판 진행은 서버 메모리에만 있어
-- 이 기록이 판 수의 원본이다. 2026-11-16 배포 전 판은 보상이 생긴 판만 원장(13번 spot_difference_rewards)에 남는다.
-- 한 판은 6라운드, 라운드마다 60초 안에 다른 곳 6개를 찾는다. 찾은 곳마다 보통 2냥·어려움 3냥(13번 공동 한도 안).
-- 교체(RESTARTED)는 진행 중에 새 판을 시작한 것, 만료(EXPIRED)는 15분 안에 끝내지 않은 판이다. 만료는 다음 시작 요청
-- 때 정리되므로 기록 시각은 마지막으로 행동한 시각이다. 서버가 재시작되면 진행 중인 판은 기록 없이 사라진다.
-- fastest_clear_ms가 사람이 그림을 보고 찾기 어려운 값(예: 6곳을 2초 안)이면 판 기록을 따로 확인한다.
SET time_zone = '+00:00';

WITH runs AS (
    SELECT DATE(occurred_at + INTERVAL 9 HOUR) AS kst_date,
           user_id,
           props->>'$.difficulty' AS difficulty,
           props->>'$.endReason' AS end_reason,
           CAST(props->>'$.roundsStarted' AS UNSIGNED) AS rounds_started,
           CAST(props->>'$.roundsCleared' AS UNSIGNED) AS rounds_cleared,
           CAST(props->>'$.found' AS UNSIGNED) AS found,
           CAST(props->>'$.misses' AS UNSIGNED) AS misses,
           CAST(props->>'$.reward' AS UNSIGNED) AS reward,
           CAST(props->>'$.fastestClearMs' AS UNSIGNED) AS fastest_clear_ms
    FROM behavior_events
    WHERE event_type = 'GAME_PLAY_STATS' AND props->>'$.gameCode' = 'SPOT_DIFFERENCE'
)
SELECT kst_date,
       difficulty,
       COUNT(*) AS runs,
       COUNT(DISTINCT user_id) AS players,
       SUM(end_reason = 'COMPLETED') AS completed,
       SUM(end_reason = 'RESTARTED') AS restarted,
       SUM(end_reason = 'EXPIRED') AS expired,
       ROUND(100 * SUM(end_reason = 'COMPLETED') / COUNT(*), 1) AS completion_pct,
       ROUND(AVG(rounds_started), 1) AS avg_rounds_started,
       ROUND(AVG(rounds_cleared), 1) AS avg_rounds_cleared,
       ROUND(AVG(found), 1) AS avg_found,
       ROUND(AVG(misses), 1) AS avg_misses,
       COALESCE(SUM(reward), 0) AS rewarded_coins,
       MIN(fastest_clear_ms) AS fastest_clear_ms
FROM runs
GROUP BY kst_date, difficulty
ORDER BY kst_date, difficulty;
