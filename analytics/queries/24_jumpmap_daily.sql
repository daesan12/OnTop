-- 한국 날짜(도전 시작 기준)별 돌탑 점프맵 도전 수, 도전자, 끝난 도전, 완주, 완주율, 평균 통과 구간,
-- 종료 사유별 수, 진행 중, 최고·평균 완주 시간(초), 지급 엽전, 의심 판. 기능 테이블(jump_runs, V131)을 읽는다.
-- 종료 사유: FINISH(완주) · FALL(낙하) · LAKE(호수 착수) · DISCONNECT(연결 끊김) · TIMEOUT · RESET · LEFT(이탈).
-- 완주율과 평균 통과 구간은 끝난 도전만 센다. 진행 중(STARTED)은 백업 시점에 아직 끝나지 않은 도전이다.
-- 완주 시간은 end_reason = FINISH인 도전만 집계한다. 미완주 판에 finish_ms가 0이나 중간 값으로 남아도
-- 최고·평균 기록이 왜곡되지 않게 한다. 의심 판(suspicious)은 서버가 비정상 이동으로 표시한 도전이며 따로 본다.
-- 구간별 이탈은 25번에서 본다. 보상은 원장 JUMP_GATE_REWARD가 원본이며 13번 공동 한도에 들어간다.
SET time_zone = '+00:00';

SELECT DATE(started_at + INTERVAL 9 HOUR) AS kst_date,
       COUNT(*) AS runs,
       COUNT(DISTINCT user_id) AS players,
       SUM(status = 'ENDED') AS ended,
       SUM(end_reason <=> 'FINISH') AS finished,
       ROUND(100 * SUM(end_reason <=> 'FINISH') / NULLIF(SUM(status = 'ENDED'), 0), 1) AS finish_pct,
       ROUND(AVG(CASE WHEN status = 'ENDED' THEN gates_passed END), 1) AS avg_gates_passed,
       SUM(end_reason <=> 'FALL') AS fall,
       SUM(end_reason <=> 'LAKE') AS lake,
       SUM(end_reason <=> 'DISCONNECT') AS disconnect,
       SUM(COALESCE(end_reason, '') IN ('TIMEOUT', 'RESET', 'LEFT')) AS other_end,
       SUM(status = 'STARTED') AS in_progress,
       ROUND(MIN(CASE WHEN end_reason <=> 'FINISH' THEN finish_ms END) / 1000, 1) AS best_finish_seconds,
       ROUND(AVG(CASE WHEN end_reason <=> 'FINISH' THEN finish_ms END) / 1000, 1) AS avg_finish_seconds,
       SUM(coins_granted) AS coins,
       SUM(suspicious) AS suspicious_runs
FROM jump_runs
GROUP BY kst_date
ORDER BY kst_date;
