#!/bin/sh
set -eu
umask 077

case "${1:-}" in
  ontop_dev|ontop) database=$1 ;;
  *) echo 'Usage: sh verify-skewer-coop-db.sh ontop_dev|ontop' >&2; exit 2 ;;
esac

config=$(mktemp /dev/shm/ontop-mysql-client.XXXXXX)
trap 'rm -f -- "$config"' EXIT HUP INT TERM
password=$(cat /run/secrets/mysql_root_password)
printf '[client]\nuser=root\npassword=%s\n' "$password" > "$config"
unset password

migration=$(
  mysql "--defaults-extra-file=$config" --batch --skip-column-names "$database" -e \
    "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '145' AND success = 1;"
)
tables=$(
  mysql "--defaults-extra-file=$config" --batch --skip-column-names information_schema -e \
    "SELECT COUNT(*) FROM tables WHERE table_schema = '$database' AND table_name IN ('skewer_coop_results', 'skewer_coop_rewards');"
)

if [ "$migration" != 1 ] || [ "$tables" != 2 ]; then
  echo "Skewer coop DB preflight failed: V145 success=$migration, settlement tables=$tables/2." >&2
  exit 1
fi

echo "Skewer coop DB preflight passed for $database: V145 and both settlement tables are present."
