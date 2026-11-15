-- 한국 날짜별 미니게임 보상 수령자, 공동 일일 한도 도달자와 비율, 보상 합계, 수령자 1명당 평균, 출처별 보상.
-- 서버(MinigameRewardBudget.earned)와 같이 지갑 원장에서 미니게임 보상 유형의 양수 금액을 KST 하루로 합산한다.
-- 붕어빵(MINIGAME_REWARD)·점프맵(JUMP_GATE_REWARD)·꼬치(SKEWER_REWARD)·두더지(MOLE_REWARD)가 한도 하나를 함께 쓰고,
-- 2026-11-15부터 보드게임 순위 보상(GAME_RANK_REWARD, 돌탑 생존전)도 같은 한도에 들어간다.
-- 스피드 두더지(V151)도 같은 MOLE_REWARD로 지급하므로 한도 계산에는 그대로 들어간다.
-- 출처 열에서는 원장 키로 나눈다: 기존 두더지는 'mole:reward:<판>', 스피드 두더지는 'mole:reward:speed:<판>'.
-- 한도는 MinigameRewardBudget.DAILY_CAP이다. 500냥이었다가 2026-11-12 dev, 2026-11-13 운영 배포로 1000냥이 됐다.
-- 아래 caps 표에 바뀐 날짜(KST)부터의 한도를 적는다. 운영 배포 날(11/13)은 오후부터 1000냥이라 그날 도달 비율은
-- 1000냥 기준으로 보이고, 오전에 500냥에 걸린 사람은 도달로 세지 않는다. DEV 백업은 11/12 행을 1000으로 고쳐 쓴다.
-- 서버 값이나 보상 유형이 바뀌면 caps와 아래 유형 목록도 함께 바꾼다.
-- 경기 정산·가입 선물·입장료·룰렛/플러스마이너스 지급·관리자 지급은 한도에 넣지 않는다.
-- 점프맵은 도전 1회에 최대 250냥(V141), 220m 새 공원 10단계 코스부터 500냥(V179)이고 하루 한도는 이 공동 한도를 쓴다.
-- 도달 비율이 높으면 한도가 낮아 더 할 이유가 없다는 뜻일 수 있다. 한도·보상량 조정 근거로 쓴다.
SET time_zone = '+00:00';

WITH caps (from_date, daily_cap) AS (
    VALUES ROW(DATE('2000-01-01'), 500),
           ROW(DATE('2026-11-13'), 1000)
),
daily AS (
    SELECT DATE(t.created_at + INTERVAL 9 HOUR) AS kst_date,
           w.user_id,
           SUM(t.balance_delta) AS rewards,
           SUM(CASE WHEN t.transaction_type = 'MINIGAME_REWARD' THEN t.balance_delta ELSE 0 END) AS bungeoppang,
           SUM(CASE WHEN t.transaction_type = 'JUMP_GATE_REWARD' THEN t.balance_delta ELSE 0 END) AS jumpmap,
           SUM(CASE WHEN t.transaction_type = 'SKEWER_REWARD' THEN t.balance_delta ELSE 0 END) AS skewer,
           SUM(CASE WHEN t.transaction_type = 'MOLE_REWARD'
                         AND t.idempotency_key NOT LIKE 'mole:reward:speed:%' THEN t.balance_delta ELSE 0 END) AS mole,
           SUM(CASE WHEN t.transaction_type = 'MOLE_REWARD'
                         AND t.idempotency_key LIKE 'mole:reward:speed:%' THEN t.balance_delta ELSE 0 END) AS speed_mole,
           SUM(CASE WHEN t.transaction_type = 'GAME_RANK_REWARD' THEN t.balance_delta ELSE 0 END) AS rank_reward
    FROM wallet_transactions t
    JOIN wallets w ON w.id = t.wallet_id
    WHERE t.balance_delta > 0
      AND t.transaction_type IN ('MINIGAME_REWARD', 'JUMP_GATE_REWARD', 'SKEWER_REWARD', 'MOLE_REWARD',
                                 'GAME_RANK_REWARD')
    GROUP BY kst_date, w.user_id
),
capped AS (
    SELECT d.*,
           (SELECT c.daily_cap FROM caps c WHERE c.from_date <= d.kst_date ORDER BY c.from_date DESC LIMIT 1) AS daily_cap
    FROM daily d
)
SELECT kst_date,
       MAX(daily_cap) AS daily_cap,
       COUNT(*) AS earners,
       SUM(rewards >= daily_cap) AS cap_reached_users,
       ROUND(100 * SUM(rewards >= daily_cap) / COUNT(*), 1) AS cap_reached_pct,
       SUM(rewards) AS rewards,
       ROUND(AVG(rewards), 1) AS avg_reward_per_earner,
       SUM(bungeoppang) AS bungeoppang_rewards,
       SUM(jumpmap) AS jumpmap_rewards,
       SUM(skewer) AS skewer_rewards,
       SUM(mole) AS mole_rewards,
       SUM(speed_mole) AS speed_mole_rewards,
       SUM(rank_reward) AS rank_rewards
FROM capped
GROUP BY kst_date
ORDER BY kst_date;
