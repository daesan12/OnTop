-- 한국 날짜(경기 시작 기준)별 돌탑 생존전 경기 수, 참가자, 경기당 평균·최대 인원, 종료 사유, 순위 보상.
-- 경기 기록 테이블(game_sessions·game_participants, V180)을 읽는다. 2~8명이 돌탑 위에서 끝까지 남는 보드게임이다.
-- 순위(finish_rank)와 서버가 발행한 순위 보상(rank_reward, 10~80냥)은 참가자 행에 남고, 지급은 원장의
-- GAME_RANK_REWARD로 13번 미니게임 공동 일일 한도 안에서 이뤄진다(한도에 막히면 원장 금액이 더 적다).
-- all_fallen_games는 모두 떨어져 승자 없이 끝난 경기다(ALL_FALLEN). 판돈 정산은 19·23번에서 본다.
SET time_zone = '+00:00';

WITH games AS (
    SELECT g.id, DATE(g.started_at + INTERVAL 9 HOUR) AS kst_date, g.participant_count, g.end_reason
    FROM game_sessions g
    WHERE g.game_code = 'STONE_RUMBLE' AND g.status = 'FINISHED' AND g.started_at IS NOT NULL
),
paid AS (
    SELECT game_session_id, SUM(balance_delta) AS coins
    FROM wallet_transactions
    WHERE transaction_type = 'GAME_RANK_REWARD'
    GROUP BY game_session_id
),
-- 참가자 행(명목 보상·기권)을 경기 하나로 먼저 접고, 그 뒤에 경기별 실제 지급(paid, 이미 경기당 한 행)을 붙인다.
-- 지급 원장은 참가자마다 따로 생기지만 paid에서 경기별로 합쳐 두었으므로 여기서 다시 곱해지지 않는다.
participants AS (
    SELECT p.game_session_id,
           SUM(p.result = 'FORFEIT') AS forfeits,
           COALESCE(SUM(p.rank_reward), 0) AS nominal
    FROM game_participants p
    JOIN games g ON g.id = p.game_session_id
    GROUP BY p.game_session_id
),
per_game AS (
    SELECT g.id, g.kst_date, g.participant_count, g.end_reason,
           COALESCE(pt.forfeits, 0) AS forfeits,
           COALESCE(pt.nominal, 0) AS nominal,
           COALESCE(pd.coins, 0) AS paid
    FROM games g
    LEFT JOIN participants pt ON pt.game_session_id = g.id
    LEFT JOIN paid pd ON pd.game_session_id = g.id
),
players AS (
    SELECT g.kst_date, COUNT(DISTINCT p.user_id) AS players
    FROM games g
    JOIN game_participants p ON p.game_session_id = g.id
    GROUP BY g.kst_date
)
SELECT pg.kst_date,
       COUNT(*) AS games,
       MAX(pl.players) AS players,
       ROUND(AVG(pg.participant_count), 1) AS avg_participants,
       MAX(pg.participant_count) AS max_participants,
       SUM(pg.end_reason = 'ALL_FALLEN') AS all_fallen_games,
       SUM(pg.forfeits) AS forfeits,
       SUM(pg.nominal) AS nominal_rank_rewards,
       SUM(pg.paid) AS paid_rank_rewards
FROM per_game pg
JOIN players pl ON pl.kst_date = pg.kst_date
GROUP BY pg.kst_date
ORDER BY pg.kst_date;
