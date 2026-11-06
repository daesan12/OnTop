#!/bin/sh
set -eu
umask 077

case "${1:-}" in
  ontop_dev) database=$1 ;;
  *) echo 'Usage: sh verify-skewer-coop-db.sh ontop_dev' >&2; exit 2 ;;
esac

config=$(mktemp /dev/shm/ontop-mysql-client.XXXXXX)
trap 'rm -f -- "$config"' EXIT HUP INT TERM
password=$(cat /run/secrets/mysql_root_password)
printf '[client]\nuser=root\npassword=%s\n' "$password" > "$config"
unset password

# Read-only: no account data, wallet balances, or pending-result payloads.
mysql "--defaults-extra-file=$config" "$database" -e '
SELECT installed_rank, version, script, success
FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 12;
SELECT version, script, success FROM flyway_schema_history WHERE version="145";
SELECT COUNT(*) AS skewer_coop_table_count FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN ("skewer_coop_results", "skewer_coop_rewards");
'
