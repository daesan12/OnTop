#!/bin/sh
set -eu
umask 077

case "${1:-}" in
  ontop_dev|ontop) database=$1 ;;
  *) echo 'Usage: sh verify-feedback-db.sh ontop_dev|ontop' >&2; exit 2 ;;
esac

config=$(mktemp /dev/shm/ontop-mysql-client.XXXXXX)
trap 'rm -f -- "$config"' EXIT HUP INT TERM
password=$(cat /run/secrets/mysql_root_password)
printf '[client]\nuser=root\npassword=%s\n' "$password" > "$config"
unset password

mysql "--defaults-extra-file=$config" "$database" -e '
SELECT installed_rank, version, description, success
FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 20;
SELECT COUNT(*) AS feedback_table_count
FROM information_schema.tables
WHERE table_schema=DATABASE() AND table_name="feedback_messages";
'

table_count=$(mysql "--defaults-extra-file=$config" "$database" --batch --skip-column-names -e '
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema=DATABASE() AND table_name="feedback_messages";
')
if [ "$table_count" = "1" ]; then
    mysql "--defaults-extra-file=$config" "$database" -e '
    SELECT COUNT(*) AS feedback_message_count FROM feedback_messages;
    '
fi
