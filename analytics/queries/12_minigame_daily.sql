-- 한국 날짜(판 시작 기준)별 붕어빵 판 수, 이용자, 완료·포기·기한 초과·진행 중 판 수, 완료율, 평균 점수·시간, 보상 합계.
-- 행동 로그가 아닌 기능 테이블(minigame_sessions)을 읽는다.
-- 기한 초과(INVALID)는 시작 후 10분 안에 제출하지 않은 판이다. 진행 중(PLAYING)은 백업 시점에 아직 끝나지 않은 판이다.
-- 평균 점수·시간은 완료한 판만 계산한다. 보상은 시작일에 묶으므로 일일 한도 계산(13번, 종료일 기준)과 날짜가 다를 수 있다.
SET time_zone = '+00:00';

SELECT DATE(started_at + INTERVAL 9 HOUR) AS kst_date,
       COUNT(*) AS sessions,
       COUNT(DISTINCT user_id) AS players,
       SUM(status = 'COMPLETED') AS completed,
       SUM(status = 'ABANDONED') AS abandoned,
       SUM(status = 'INVALID') AS expired,
       SUM(status = 'PLAYING') AS playing,
       ROUND(100 * SUM(status = 'COMPLETED') / COUNT(*), 1) AS completion_pct,
       ROUND(AVG(CASE WHEN status = 'COMPLETED' THEN score END), 1) AS avg_score,
       ROUND(AVG(CASE WHEN status = 'COMPLETED' THEN TIMESTAMPDIFF(SECOND, started_at, ended_at) END) / 60, 1)
           AS avg_minutes,
       SUM(CASE WHEN status = 'COMPLETED' THEN reward_amount ELSE 0 END) AS rewards
FROM minigame_sessions
WHERE minigame_type = 'BUNGEOPPANG'
GROUP BY kst_date
ORDER BY kst_date;
