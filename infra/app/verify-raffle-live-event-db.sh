#!/bin/sh
# V182(11/16 행사 회차 READY 등록·마감 보정, 11/09 회차 연결, 당첨 후보 외래키 교체) 전후의 실제 DB 값을
# 읽기 전용으로 확인한다. SELECT만 실행한다.
# pre: 배포 전에 V182가 어떤 경로(11/16 생성/변경/유지, 11/09 연결/연결 실패)를 탈지 판정한다.
# post: 배포 후 마감·READY 등록·11/09 연결·외래키·마감 이후 응모권·조기 확정 여부를 판정한다.
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
       END AS v182_event_round_path
FROM (SELECT DATE '2026-11-16' AS week_start_date) w
LEFT JOIN raffle_rounds r ON r.week_start_date = w.week_start_date;
SELECT r.id AS source_round_id, r.sales_status,
       DATE_FORMAT(r.sales_ends_at, '%Y-%m-%d %H:%i:%s.%f') AS ends_utc,
       f.id AS event_round_id, f.finalized_at,
       (SELECT COUNT(*) FROM event_raffle_draws d WHERE d.event_round_id = f.id AND d.status = 'REVIEW') AS reviews,
       CASE
         WHEN r.id IS NULL THEN 'ABSENT: 11/09 회차가 없어 연결 실패로 남는다. 통합 추첨이 막히므로 원인을 확인한다'
         WHEN f.finalized_at IS NOT NULL THEN 'FINALIZED: 이미 확정돼 연결하지 않는다. 배포를 보류하고 정책을 결정한다'
         ELSE 'LINKABLE: V182가 11/09 회차를 행사에 연결한다'
       END AS v182_source_round_path
FROM (SELECT DATE '2026-11-09' AS week_start_date) w
LEFT JOIN raffle_rounds r ON r.week_start_date = w.week_start_date
LEFT JOIN event_rounds f ON f.event_type = 'RAFFLE' AND f.raffle_round_id = r.id;
SELECT DATE_FORMAT(r.week_start_date, '%Y-%m-%d') AS week, COUNT(t.id) AS tickets_total,
       COALESCE(SUM(t.purchased_at >= r.sales_starts_at AND t.purchased_at < r.sales_ends_at), 0) AS tickets_in_window,
       COUNT(DISTINCT t.user_id) AS buyers
FROM raffle_rounds r LEFT JOIN raffle_tickets t ON t.round_id = r.id
WHERE r.week_start_date IN ('2026-11-09', '2026-11-16')
GROUP BY r.week_start_date ORDER BY r.week_start_date;
SELECT constraint_name AS picks_foreign_key FROM information_schema.referential_constraints
WHERE constraint_schema = DATABASE() AND table_name = 'event_raffle_draw_picks' ORDER BY constraint_name;
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
SELECT DATE_FORMAT(w.week_start_date, '%Y-%m-%d') AS week, l.raffle_round_id,
       f.finalized_at AS source_finalized_at,
       CASE
         WHEN l.week_start_date IS NULL THEN 'FAIL: 연결 행 없음 — 통합 추첨 불가'
         WHEN l.raffle_round_id IS NULL THEN 'FAIL: 연결 실패(회차 없음 또는 이미 확정) — 통합 추첨 불가'
         WHEN w.week_start_date = '2026-11-09' AND f.finalized_at IS NOT NULL THEN 'FAIL: 연결 회차가 확정됨'
         ELSE 'PASS'
       END AS link_check
FROM (SELECT DATE '2026-11-09' AS week_start_date UNION ALL SELECT DATE '2026-11-16') w
LEFT JOIN raffle_live_event_rounds l ON l.week_start_date = w.week_start_date
LEFT JOIN event_rounds f ON f.event_type = 'RAFFLE' AND f.raffle_round_id = l.raffle_round_id
ORDER BY w.week_start_date;
SELECT IF(SUM(constraint_name = 'fk_event_raffle_draw_picks_ticket_user') = 1
          AND SUM(constraint_name = 'fk_event_raffle_draw_picks_ticket_owner') = 0, 'PASS', 'FAIL') AS picks_fk_check
FROM information_schema.referential_constraints
WHERE constraint_schema = DATABASE() AND table_name = 'event_raffle_draw_picks';
SELECT DATE_FORMAT(r.week_start_date, '%Y-%m-%d') AS week, COUNT(t.id) AS tickets_total,
       COALESCE(SUM(t.purchased_at >= r.sales_starts_at AND t.purchased_at < r.sales_ends_at), 0) AS tickets_in_window,
       COALESCE(SUM(t.purchased_at >= r.sales_ends_at), 0) AS tickets_at_or_after_deadline,
       IF(COALESCE(SUM(t.purchased_at >= r.sales_ends_at), 0) = 0, 'PASS',
          'FAIL: 마감 이후 응모권은 후보에서 빠진다. 엽전 차감과 대조·복구한다') AS late_ticket_check
FROM raffle_rounds r LEFT JOIN raffle_tickets t ON t.round_id = r.id
WHERE r.week_start_date IN ('2026-11-09', '2026-11-16')
GROUP BY r.week_start_date ORDER BY r.week_start_date;
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
