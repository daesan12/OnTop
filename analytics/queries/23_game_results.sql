-- 경기 기록 테이블 기준 게임·종료 사유별 종료 경기 수, 평균 경기 시간(분), 참가자, 기권, 이탈 사유, 정산 완료 수.
-- 행동 로그가 아닌 원본 테이블이라 로그를 켜기 전·로그가 빠진 경기도 들어간다(06번은 로그 기준).
-- 종료 사유(end_reason)는 엔진이 정한 값이다. 예: FIVE_IN_ROW, TARGET_REACHED, FORFEIT, TURN_TIMEOUT.
-- disconnect_leaves는 재접속 유예가 끝나 빠진 참가자, explicit_leaves는 기권 버튼으로 나간 참가자다.
-- 기권·연결 끊김 종료가 많은 게임은 규칙 안내·시간 제한·재접속 흐름을 점검한다.
SET time_zone = '+00:00';

WITH finished AS (
    SELECT id,
           game_code,
           end_reason,
           TIMESTAMPDIFF(SECOND, started_at, ended_at) AS seconds,
           settlement_status = 'SETTLED' AS settled
    FROM game_sessions
    WHERE status = 'FINISHED'
),
participants AS (
    SELECT game_session_id,
           COUNT(*) AS players,
           -- 결과·이탈 사유가 비어 있는(NULL) 참가자도 0으로 세도록 <=>로 비교한다.
           SUM(result <=> 'FORFEIT') AS forfeits,
           SUM(leave_reason <=> 'DISCONNECT_TIMEOUT') AS disconnect_leaves,
           SUM(leave_reason <=> 'EXPLICIT_LEAVE') AS explicit_leaves
    FROM game_participants
    GROUP BY game_session_id
)
SELECT f.game_code,
       f.end_reason,
       COUNT(*) AS games,
       ROUND(AVG(f.seconds) / 60, 1) AS avg_minutes,
       SUM(p.players) AS participants,
       SUM(p.forfeits) AS forfeits,
       SUM(p.disconnect_leaves) AS disconnect_leaves,
       SUM(p.explicit_leaves) AS explicit_leaves,
       SUM(f.settled) AS settled_games
FROM finished f
JOIN participants p ON p.game_session_id = f.id
GROUP BY f.game_code, f.end_reason
ORDER BY f.game_code, f.end_reason;
