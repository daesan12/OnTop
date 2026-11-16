#!/bin/sh
# V182(2026-11-16 회차 마감 보정·공개 추첨 행사 READY 등록) 전후의 실제 DB 값을 읽기 전용으로 확인한다.
# pre: 배포 전에 V182가 어떤 경로(행 생성/값 변경/유지)를 탈지 판정한다.
# post: 배포 후 마감·READY 등록·마감 이후 응모권·조기 확정 여부를 판정한다.
set -eu
umask 077

case "${1:-}" in
  ontop_dev|ontop) database=$1 ;;
  *) echo 'Usage: sh verify-raffle-live-event-db.sh ontop_dev|ontop pre|post' >&2; exit 2 ;;
esac
case "${2:-}" in
  pre|post) mode=$2 ;;
  *) echo 'Usage: sh verify-raffle-live-event-db.sh ontop_dev|ontop pre|post' >&2; exit 2 ;;
esac

config=$(mktemp /dev/shm/ontop-mysql-client.XXXXXX)
trap 'rm -f -- "$config"' EXIT HUP INT TERM
password=$(cat /run/secrets/mysql_root_password)
printf '[client]\nuser=root\npassword=%s\n' "$password" > "$config"
unset password

if [ "$mode" = pre ]; then
  mysql "--defaults-extra-file=$config" --table "$database" <<'SQL'
SET time_zone = '+00:00';
SELECT @@global.time_zone AS global_time_zone, @@session.time_zone AS check_session_time_zone;
SELECT MAX(CAST(version AS UNSIGNED)) AS applied_version FROM flyway_schema_history WHERE success = 1;
SELECT r.id, r.sales_status,
       DATE_FORMAT(r.sales_starts_at, '%Y-%m-%d %H:%i:%s.%f') AS starts_utc,
       DATE_FORMAT(r.sales_ends_at, '%Y-%m-%d %H:%i:%s.%f') AS ends_utc,
       CASE
         WHEN r.id IS NULL THEN 'ABSENT: V182가 11/18 15:00 UTC 종료 회차를 새로 만든다'
         WHEN r.sales_ends_at = '2026-11-22 15:00:00.000' THEN 'EXPECTED: V182가 종료를 11/18 15:00 UTC로 바꾼다'
         WHEN r.sales_ends_at = '2026-11-18 15:00:00.000' THEN 'ALREADY_TARGET: 이미 목표값이다'
         ELSE 'UNEXPECTED: V182가 값을 바꾸지 않는다. 배포를 보류하고 원인을 확인한다'
       END AS v182_path
FROM (SELECT DATE '2026-11-16' AS week_start_date) w
LEFT JOIN raffle_rounds r ON r.week_start_date = w.week_start_date;
SELECT COUNT(*) AS tickets_total,
       COALESCE(SUM(t.purchased_at >= '2026-11-18 15:00:00.000'), 0) AS tickets_at_or_after_deadline
FROM raffle_tickets t JOIN raffle_rounds r ON r.id = t.round_id
WHERE r.week_start_date = '2026-11-16';
SQL
else
  mysql "--defaults-extra-file=$config" --table "$database" <<'SQL'
SET time_zone = '+00:00';
SELECT version, description, success, installed_on FROM flyway_schema_history WHERE version = '182';
SELECT r.id, r.sales_status,
       DATE_FORMAT(r.sales_ends_at, '%Y-%m-%d %H:%i:%s.%f') AS ends_utc,
       DATE_FORMAT(CONVERT_TZ(r.sales_ends_at, '+00:00', '+09:00'), '%Y-%m-%d %H:%i:%s') AS ends_kst,
       IF(r.sales_ends_at = '2026-11-18 15:00:00.000', 'PASS', 'FAIL: 마감 미반영') AS deadline_check,
       COALESCE(CONCAT(e.status, '/', e.registration_source), 'FAIL: 미등록') AS live_event,
       IF(e.status IS NOT NULL, 'PASS', 'FAIL') AS lock_check
FROM raffle_rounds r
LEFT JOIN raffle_live_events e ON e.raffle_round_id = r.id
WHERE r.week_start_date = '2026-11-16';
SELECT COUNT(t.id) AS tickets_total,
       COALESCE(SUM(t.purchased_at >= r.sales_ends_at), 0) AS tickets_at_or_after_deadline,
       IF(COALESCE(SUM(t.purchased_at >= r.sales_ends_at), 0) = 0, 'PASS',
          'FAIL: 마감 이후 응모권은 후보에서 빠진다. 엽전 차감과 대조·복구한다') AS late_ticket_check
FROM raffle_rounds r LEFT JOIN raffle_tickets t ON t.round_id = r.id
WHERE r.week_start_date = '2026-11-16';
SELECT e.id AS event_round_id, e.finalized_at,
       CASE
         WHEN e.id IS NULL THEN 'PASS: 아직 사전 추첨 전'
         WHEN e.finalized_at IS NULL THEN 'PASS'
         ELSE 'CHECK: 이미 확정됨'
       END AS not_finalized_check
FROM (SELECT DATE '2026-11-16' AS week_start_date) w
LEFT JOIN event_rounds e ON e.event_type = 'RAFFLE' AND e.week_start_date = w.week_start_date;
SQL
fi
