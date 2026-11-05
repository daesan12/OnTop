-- 한국 날짜(판 종료 기준)별 꼬치 협동(2인 팀) 판 수, 참가자, 평균·최고 팀 점수, 평균 서빙 수, 평균 경기 시간,
-- 시간 종료(SKEWER_TIME_UP)·중도 종료 판, 랭킹 인정 판, 계산된 보상과 실제 지급.
-- 기능 테이블(skewer_coop_results·skewer_coop_rewards, V145)을 읽는다. 지급은 원장 SKEWER_REWARD이며
-- 13번 공동 일일 한도에 포함된다. 입장료(10냥)는 원장 MINIGAME_ENTRY_FEE(키 접두어 skewer:)로 따로 빠진다.
-- 중도 종료가 많으면 2인 매칭이나 역할 분담 흐름을 점검한다. 보상은 한 판에 두 사람 몫이 합쳐져 있다.
SET time_zone = '+00:00';

WITH games AS (
    SELECT game_id,
           DATE(ended_at + INTERVAL 9 HOUR) AS kst_date,
           team_low_id,
           team_high_id,
           team_score,
           served,
           elapsed_ms,
           end_reason,
           ranking_eligible
    FROM skewer_coop_results
),
players AS (
    SELECT kst_date, team_low_id AS user_id FROM games
    UNION
    SELECT kst_date, team_high_id FROM games
),
rewards AS (
    SELECT game_id, SUM(coins_calculated) AS calculated, SUM(coins_granted) AS granted
    FROM skewer_coop_rewards
    GROUP BY game_id
)
SELECT g.kst_date,
       COUNT(*) AS games,
       (SELECT COUNT(*) FROM players p WHERE p.kst_date = g.kst_date) AS players,
       ROUND(AVG(g.team_score), 1) AS avg_team_score,
       MAX(g.team_score) AS max_team_score,
       ROUND(AVG(g.served), 1) AS avg_served,
       ROUND(AVG(g.elapsed_ms) / 60000, 1) AS avg_minutes,
       SUM(g.end_reason = 'SKEWER_TIME_UP') AS time_up,
       SUM(g.end_reason <> 'SKEWER_TIME_UP') AS ended_early,
       SUM(g.ranking_eligible) AS ranking_eligible,
       COALESCE(SUM(r.calculated), 0) AS calculated_coins,
       COALESCE(SUM(r.granted), 0) AS granted_coins
FROM games g
LEFT JOIN rewards r ON r.game_id = g.game_id
GROUP BY g.kst_date
ORDER BY g.kst_date;
