-- 경기 기록 테이블(game_sessions)과 행동 로그의 대조. 한국 날짜(경기 시작, 거절은 시도 시각)·게임별로
-- 시작 시도, 시작 거절, 확정 경기, 시작 로그가 있는 경기, 종료 경기, 종료 로그가 있는 경기를 센다.
-- 행동 로그의 game_id는 game_sessions.id와 같은 값이다.
-- start_log_pct·end_log_pct가 100보다 작으면 그 날짜에 로그가 빠졌거나 로그가 꺼져 있던 것이다.
-- 그 구간의 06·18번(행동 로그 기준) 수치는 실제보다 작으므로 23번(경기 테이블 기준)과 함께 본다.
-- 거절(REJECTED)은 잔액 부족 등으로 예약 전에 막힌 시도이며 행동 로그를 남기지 않는다.
SET time_zone = '+00:00';

WITH logged AS (
    SELECT game_id,
           MAX(event_type = 'GAME_STARTED') AS has_start_log,
           MAX(event_type = 'GAME_ENDED') AS has_end_log
    FROM behavior_events
    WHERE event_type IN ('GAME_STARTED', 'GAME_ENDED') AND game_id IS NOT NULL
    GROUP BY game_id
),
games AS (
    SELECT DATE(COALESCE(g.started_at, g.created_at) + INTERVAL 9 HOUR) AS kst_date,
           g.game_code,
           g.status,
           g.reserved_at IS NOT NULL AS confirmed,
           g.ended_at IS NOT NULL AS finished,
           COALESCE(l.has_start_log, 0) AS has_start_log,
           COALESCE(l.has_end_log, 0) AS has_end_log
    FROM game_sessions g
    LEFT JOIN logged l ON l.game_id = CAST(g.id AS CHAR)
)
SELECT kst_date,
       game_code,
       COUNT(*) AS start_attempts,
       SUM(status = 'REJECTED') AS rejected_starts,
       SUM(confirmed) AS confirmed_games,
       SUM(confirmed AND has_start_log) AS with_start_log,
       SUM(finished) AS finished_games,
       SUM(finished AND has_end_log) AS with_end_log,
       ROUND(100 * SUM(confirmed AND has_start_log) / NULLIF(SUM(confirmed), 0), 1) AS start_log_pct,
       ROUND(100 * SUM(finished AND has_end_log) / NULLIF(SUM(finished), 0), 1) AS end_log_pct
FROM games
GROUP BY kst_date, game_code
ORDER BY kst_date, game_code;
