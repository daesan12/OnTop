-- 과일 땡(할리갈리) 회원별 종 반응 시간(GAME_PLAY_STATS, S15P31B105-419). 경기마다 참가자별 요약 한 행을 합친다.
-- 반응 시간은 종 창을 연 카드 공개를 서버가 처리한 시각부터 맞힌 종이 서버에 닿을 때까지다(통신 시간 포함).
-- 사람은 공개를 보고 과일 수를 세야 해서 보통 0.4초 이상 걸리고, 화면 상태를 읽는 프로그램은 0.15초 안팎이다.
-- fast_pct(150ms 미만 비율)가 높고 penalty_rings가 0에 가까우면 기계적으로 친 것으로 의심한다.
-- first_ring_pct = 맞힌 종 / (맞힌 종 + 이미 닫힌 창에 늦게 닿은 종). 남보다 먼저 친 비율이다.
-- avg_reaction_ms는 경기별 평균을 맞힌 종 수로 가중 평균한 값이다. 맞힌 종이 없으면 반응 시간 열은 NULL이다.
-- 2026-11-12 배포 전 경기에는 이 기록이 없다. 결과에 회원 번호만 있으니 공유할 때도 닉네임을 붙이지 않는다.
SET time_zone = '+00:00';

WITH stats AS (
    SELECT user_id,
           game_id,
           CAST(JSON_EXTRACT(props, '$.successRings') AS UNSIGNED) AS success,
           CAST(JSON_EXTRACT(props, '$.penaltyRings') AS UNSIGNED) AS penalty,
           CAST(JSON_EXTRACT(props, '$.lateRings') AS UNSIGNED) AS late,
           CAST(JSON_EXTRACT(props, '$.reactionMinMs') AS UNSIGNED) AS min_ms,
           CAST(JSON_EXTRACT(props, '$.reactionAvgMs') AS UNSIGNED) AS avg_ms,
           CAST(JSON_EXTRACT(props, '$.under150Ms') AS UNSIGNED) AS under150,
           CAST(JSON_EXTRACT(props, '$.under300Ms') AS UNSIGNED) AS under300
    FROM behavior_events
    WHERE event_type = 'GAME_PLAY_STATS'
      AND JSON_UNQUOTE(JSON_EXTRACT(props, '$.gameCode')) = 'HALLI_GALLI'
)
SELECT user_id,
       COUNT(DISTINCT game_id) AS games,
       SUM(success) AS success_rings,
       SUM(penalty) AS penalty_rings,
       SUM(late) AS late_rings,
       ROUND(100 * SUM(success) / NULLIF(SUM(success) + SUM(late), 0), 1) AS first_ring_pct,
       MIN(min_ms) AS min_reaction_ms,
       ROUND(SUM(avg_ms * success) / NULLIF(SUM(CASE WHEN avg_ms IS NOT NULL THEN success END), 0)) AS avg_reaction_ms,
       ROUND(100 * SUM(under150) / NULLIF(SUM(success), 0), 1) AS fast_pct,
       ROUND(100 * SUM(under300) / NULLIF(SUM(success), 0), 1) AS quick_pct
FROM stats
GROUP BY user_id
ORDER BY fast_pct DESC, user_id;
