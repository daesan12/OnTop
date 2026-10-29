-- 한국 날짜(판 종료 기준)별 붕어빵 완료자, 일일 보상 한도 도달자와 비율, 보상 합계, 완료자 1명당 평균 보상.
-- 서버(MinigameService.earned)와 같이 완료한 판의 보상을 종료 시각의 한국 날짜로 합산한다.
-- 한도 100은 BungeoppangRules.DAILY_CAP과 같다. 서버 값이 바뀌면 아래 숫자도 바꾼다.
-- 도달 비율이 높으면 한도가 너무 낮아 더 할 이유가 없다는 뜻일 수 있다.
SET time_zone = '+00:00';

WITH daily AS (
    SELECT DATE(ended_at + INTERVAL 9 HOUR) AS kst_date,
           user_id,
           SUM(reward_amount) AS rewards
    FROM minigame_sessions
    WHERE minigame_type = 'BUNGEOPPANG' AND status = 'COMPLETED'
    GROUP BY kst_date, user_id
)
SELECT kst_date,
       COUNT(*) AS completers,
       SUM(rewards >= 100) AS cap_reached_users,
       ROUND(100 * SUM(rewards >= 100) / COUNT(*), 1) AS cap_reached_pct,
       SUM(rewards) AS rewards,
       ROUND(AVG(rewards), 1) AS avg_reward_per_completer
FROM daily
GROUP BY kst_date
ORDER BY kst_date;
