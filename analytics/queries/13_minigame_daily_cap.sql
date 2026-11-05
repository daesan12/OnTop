-- 한국 날짜별 미니게임 보상 수령자, 공동 일일 한도 도달자와 비율, 보상 합계, 수령자 1명당 평균, 출처별 보상.
-- 서버(MinigameRewardBudget.earned)와 같이 지갑 원장에서 미니게임 보상 유형의 양수 금액을 KST 하루로 합산한다.
-- 붕어빵(MINIGAME_REWARD)·점프맵(JUMP_GATE_REWARD)·꼬치(SKEWER_REWARD)·두더지(MOLE_REWARD)가 한도 하나를 함께 쓴다.
-- 한도 500은 MinigameRewardBudget.DAILY_CAP과 같다. 서버 값이나 보상 유형이 바뀌면 아래도 함께 바꾼다.
-- 경기 정산·가입 선물·입장료·룰렛/플러스마이너스 지급·관리자 지급은 한도에 넣지 않는다.
-- 점프맵은 도전 1회에 최대 250냥(V141)이고 하루 한도는 이 공동 한도를 쓴다.
-- 도달 비율이 높으면 한도가 낮아 더 할 이유가 없다는 뜻일 수 있다. 한도·보상량 조정 근거로 쓴다.
SET time_zone = '+00:00';

WITH daily AS (
    SELECT DATE(t.created_at + INTERVAL 9 HOUR) AS kst_date,
           w.user_id,
           SUM(t.balance_delta) AS rewards,
           SUM(CASE WHEN t.transaction_type = 'MINIGAME_REWARD' THEN t.balance_delta ELSE 0 END) AS bungeoppang,
           SUM(CASE WHEN t.transaction_type = 'JUMP_GATE_REWARD' THEN t.balance_delta ELSE 0 END) AS jumpmap,
           SUM(CASE WHEN t.transaction_type = 'SKEWER_REWARD' THEN t.balance_delta ELSE 0 END) AS skewer,
           SUM(CASE WHEN t.transaction_type = 'MOLE_REWARD' THEN t.balance_delta ELSE 0 END) AS mole
    FROM wallet_transactions t
    JOIN wallets w ON w.id = t.wallet_id
    WHERE t.balance_delta > 0
      AND t.transaction_type IN ('MINIGAME_REWARD', 'JUMP_GATE_REWARD', 'SKEWER_REWARD', 'MOLE_REWARD')
    GROUP BY kst_date, w.user_id
)
SELECT kst_date,
       COUNT(*) AS earners,
       SUM(rewards >= 500) AS cap_reached_users,
       ROUND(100 * SUM(rewards >= 500) / COUNT(*), 1) AS cap_reached_pct,
       SUM(rewards) AS rewards,
       ROUND(AVG(rewards), 1) AS avg_reward_per_earner,
       SUM(bungeoppang) AS bungeoppang_rewards,
       SUM(jumpmap) AS jumpmap_rewards,
       SUM(skewer) AS skewer_rewards,
       SUM(mole) AS mole_rewards
FROM daily
GROUP BY kst_date
ORDER BY kst_date;
