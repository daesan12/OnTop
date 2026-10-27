-- 시설별 이용 횟수, 이용자 수, 평균 이용 시간(분), 연결 끊김으로 끝난 이용 수, 종료 기록이 없는 이용 수.
-- 시작(FACILITY_USED)과 종료(FACILITY_RELEASED)는 leaseId로 짝을 맞춘다. 이용 시간은 서버가 남긴 durationMs다.
-- 종료 기록이 없는 이용(서버 종료·백업 시점에 이용 중)은 평균 이용 시간에서 빠진다.
-- 연결 끊김 종료가 많은 시설은 자리를 비운 채 점유하는 경우가 많다는 뜻일 수 있다.
SET time_zone = '+00:00';

WITH used AS (
    SELECT props->>'$.leaseId' AS lease_id,
           user_id,
           props->>'$.facilityId' AS facility_id,
           props->>'$.kind' AS kind
    FROM behavior_events
    WHERE event_type = 'FACILITY_USED'
),
released AS (
    SELECT props->>'$.leaseId' AS lease_id,
           MIN(CAST(props->>'$.durationMs' AS UNSIGNED)) AS duration_ms,
           MAX(props->>'$.endReason' = 'DISCONNECTED') AS disconnected
    FROM behavior_events
    WHERE event_type = 'FACILITY_RELEASED'
    GROUP BY lease_id
)
SELECT u.kind,
       u.facility_id,
       COUNT(*) AS uses,
       COUNT(DISTINCT u.user_id) AS users,
       ROUND(AVG(r.duration_ms) / 60000, 1) AS avg_minutes,
       COALESCE(SUM(r.disconnected), 0) AS disconnected_ends,
       SUM(r.lease_id IS NULL) AS unended
FROM used u
LEFT JOIN released r ON r.lease_id = u.lease_id
GROUP BY u.kind, u.facility_id
ORDER BY uses DESC, u.facility_id;
