-- 시설별 이용 횟수, 이용자 수, 평균 이용 시간(분), 연결 끊김으로 끝난 이용 수, 종료 기록이 없는 이용 수.
-- 시작(FACILITY_USED)과 종료(FACILITY_RELEASED)는 leaseId로 짝을 맞춘다. 이용 시간은 서버가 남긴 durationMs다.
-- 탈것(2026-11-15~, S15P31B105-440)도 같은 이벤트로 남는다. kind는 BICYCLE(전기자전거)·SCOOTER(킥보드), facility_id는
-- 대여소(mobility-*), 이용 시간은 요금을 낸 초 수, fee_coins는 낸 대여료 합계다. 첫 요금을 못 내 타지 못한 대여는 없다.
-- 탈것 종료 사유(endReason): RELEASED(직접 하차)·AUTO_ENDED(물·점프맵 등 탈 수 없는 상태)·CHANNEL_LEFT·
-- DISCONNECTED·INSUFFICIENT(잔액 부족)·FAILED(결제 실패).
-- 열기구(2026-11-16~, S15P31B105-446)는 kind BALLOON, facility_id balloon이고 탑승권(leaseId)마다 한 번이다.
-- 탑승권을 실제로 써서 이륙한 사람만 남고(혼자는 첫 비행, 여럿은 출발 때), 이용 시간은 이륙부터 내릴 때까지,
-- fee_coins는 탑승료(1인 100냥) 합계다. role(PILOT·PASSENGER)·riders(함께 탄 인원)·mode는 행동 로그에서 본다.
-- 열기구 종료 사유: ENDED(직접)·PILOT_ENDED(조종사가 끝내 함께 내림)·EXPIRED(시간 초과)·DISCONNECTED·CHANNEL_LEFT.
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
           MAX(props->>'$.endReason' = 'DISCONNECTED') AS disconnected,
           MAX(CAST(props->>'$.fee' AS UNSIGNED)) AS fee
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
       SUM(r.lease_id IS NULL) AS unended,
       SUM(r.fee) AS fee_coins
FROM used u
LEFT JOIN released r ON r.lease_id = u.lease_id
GROUP BY u.kind, u.facility_id
ORDER BY uses DESC, u.facility_id;
