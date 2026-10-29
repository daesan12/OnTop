#!/bin/sh
set -eu
umask 077

case "${1:-}" in
  ontop_dev|ontop) database=$1 ;;
  *) echo 'Usage: sh verify-behavior-db.sh ontop_dev|ontop' >&2; exit 2 ;;
esac

config=$(mktemp /dev/shm/ontop-mysql-client.XXXXXX)
trap 'rm -f -- "$config"' EXIT HUP INT TERM
password=$(cat /run/secrets/mysql_root_password)
printf '[client]\nuser=root\npassword=%s\n' "$password" > "$config"
unset password

mysql "--defaults-extra-file=$config" "$database" -e '
SELECT version, success FROM flyway_schema_history WHERE version IN (5, 6) ORDER BY version;
SELECT event_type, COUNT(*) AS event_count FROM behavior_events GROUP BY event_type;
SELECT COUNT(*) AS world_position_sample_count FROM world_position_samples;
'
