-- 클라이언트 성능(PERF_REPORT): 한국 날짜·기기(desktop/mobile)·GPU 제조사별 1분 보고 수와 프레임 지표.
-- 보고는 공원에 있는 동안 1분마다, 그 사이 그린 프레임이 있을 때만 온다(탭을 숨기면 오지 않는다).
-- avg_fps·avg_p95_ms는 보고마다 최근 최대 600프레임 기준 값의 평균이고,
-- slow_frame_pct는 그 날 센 전체 프레임 중 50ms를 넘은 프레임 비율이다.
-- low_fps_report_pct가 높은 기기·GPU 조합부터 품질 기본값·그리기 비용을 점검한다.
SET time_zone = '+00:00';

WITH reports AS (
    SELECT DATE(occurred_at + INTERVAL 9 HOUR) AS kst_date,
           JSON_UNQUOTE(JSON_EXTRACT(props, '$.device')) AS device,
           JSON_UNQUOTE(JSON_EXTRACT(props, '$.gpu')) AS gpu,
           user_id,
           CAST(JSON_EXTRACT(props, '$.fps') AS DECIMAL(10, 2)) AS fps,
           CAST(JSON_EXTRACT(props, '$.p95Ms') AS DECIMAL(10, 2)) AS p95_ms,
           CAST(JSON_EXTRACT(props, '$.frames') AS UNSIGNED) AS frames,
           CAST(JSON_EXTRACT(props, '$.slowFrames') AS UNSIGNED) AS slow_frames
    FROM behavior_events
    WHERE event_type = 'PERF_REPORT' AND source = 'CLIENT'
)
SELECT kst_date,
       device,
       gpu,
       COUNT(*) AS reports,
       COUNT(DISTINCT user_id) AS users,
       ROUND(AVG(fps), 1) AS avg_fps,
       ROUND(AVG(p95_ms), 1) AS avg_p95_ms,
       ROUND(100 * SUM(slow_frames) / NULLIF(SUM(frames), 0), 2) AS slow_frame_pct,
       ROUND(100 * SUM(fps < 30) / COUNT(*), 1) AS low_fps_report_pct
FROM reports
GROUP BY kst_date, device, gpu
ORDER BY kst_date, device, gpu;
