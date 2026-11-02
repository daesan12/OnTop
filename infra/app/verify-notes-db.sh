#!/bin/sh
set -eu
umask 077

case "${1:-}" in
  ontop_dev|ontop) database=$1 ;;
  *) echo 'Usage: sh verify-notes-db.sh ontop_dev|ontop' >&2; exit 2 ;;
esac

config=$(mktemp /dev/shm/ontop-mysql-client.XXXXXX)
trap 'rm -f -- "$config"' EXIT HUP INT TERM
password=$(cat /run/secrets/mysql_root_password)
printf '[client]\nuser=root\npassword=%s\n' "$password" > "$config"
unset password

# Read-only. Prints Flyway history, legacy db/notes versions, and notes schema; never prints note bodies.
mysql "--defaults-extra-file=$config" "$database" -e '
SELECT installed_rank, version, description, success
FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 20;
SELECT COUNT(*) AS legacy_notes_history_count
FROM flyway_schema_history WHERE version IN ("121","129");
SELECT version, success FROM flyway_schema_history WHERE version="133";
SELECT COUNT(*) AS notes_table_count
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN ("anonymous_notes","anonymous_note_requests","anonymous_note_rates","anonymous_note_board");
SELECT table_name, column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name LIKE "anonymous_note%"
ORDER BY table_name, ordinal_position;
'

board=$(mysql "--defaults-extra-file=$config" "$database" --batch --skip-column-names -e '
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema=DATABASE() AND table_name="anonymous_note_board";
')
if [ "$board" = "1" ]; then
    mysql "--defaults-extra-file=$config" "$database" -e '
    SELECT COUNT(*) AS notes_board_rows FROM anonymous_note_board;
    SELECT COUNT(*) AS note_count FROM anonymous_notes;
    '
fi
