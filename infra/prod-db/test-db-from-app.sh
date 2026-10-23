#!/usr/bin/env bash
set -euo pipefail
umask 077

# Read the app password from stdin. Never put it in a command argument or log.
IFS= read -r password
if [[ ! $password =~ ^[0-9a-f]{64}$ ]]; then
  echo "Expected the generated app password on stdin." >&2
  exit 1
fi

client_config=$(mktemp /dev/shm/ontop-db-test.XXXXXX)
trap 'rm -f -- "$client_config"' EXIT
printf '[client]\nuser=ontop_app\npassword=%s\n' "$password" > "$client_config"
unset password

mysql --defaults-extra-file="$client_config" \
  --host=10.77.0.1 --port=3306 --database=ontop \
  --batch --skip-column-names \
  --execute='SELECT 1 AS db_reachable, DATABASE() AS current_db;'
