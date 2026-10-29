#!/bin/sh
set -eu
umask 077

client=${1:?Pass mysql or mysqldump as the first argument}
shift
case "$client" in
  mysql|mysqldump) ;;
  *) echo 'Unsupported MySQL client.' >&2; exit 2 ;;
esac

config=$(mktemp /dev/shm/ontop-mysql-client.XXXXXX)
trap 'rm -f -- "$config"' EXIT HUP INT TERM
password=$(cat /run/secrets/mysql_root_password)
printf '[client]\nuser=root\npassword=%s\n' "$password" > "$config"
unset password
"$client" "--defaults-extra-file=$config" "$@"
