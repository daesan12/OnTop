#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ ( $# -ne 1 && $# -ne 3 ) || ! $1 =~ ^ontop-prod-[0-9]{8}T[0-9]{6}Z\.sql\.gz$ ]]; then
  echo 'Usage: restore-test.sh ontop-prod-YYYYMMDDTHHMMSSZ.sql.gz [table expected_rows]' >&2
  exit 2
fi
name=$1
if [[ $# -eq 3 ]]; then
  if [[ ! $2 =~ ^[A-Za-z][A-Za-z0-9_]*$ || ! $3 =~ ^[0-9]+$ ]]; then
    echo 'Table must be an identifier and expected_rows a nonnegative integer.' >&2
    exit 2
  fi
  expected_table=$2
  expected_rows=$3
fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
config_file=${ONTOP_DB_CONFIG:-/etc/ontop/prod-db/compose.env}
if [[ ! -r $config_file ]]; then
  echo "Cannot read $config_file" >&2
  exit 1
fi
set -a
source "$config_file"
set +a
: "${BACKUP_S3_URI:?Set BACKUP_S3_URI in compose.env}"
[[ $BACKUP_S3_URI == s3://* ]] || { echo 'BACKUP_S3_URI must be s3://...' >&2; exit 1; }

workdir=$(mktemp -d)
export RESTORE_TEST_DATA_DIR="$workdir/mysql-data"
mkdir -m 0700 "$RESTORE_TEST_DATA_DIR"
compose=(docker compose --env-file "$config_file" -f "$script_dir/compose.yaml" --profile restore-test)
cleanup() {
  "${compose[@]}" rm -sf restore-test >/dev/null 2>&1 || true
  rm -rf -- "$workdir"
}
trap cleanup EXIT

source_uri="${BACKUP_S3_URI%/}/$name"
aws s3 cp "$source_uri" "$workdir/$name" --only-show-errors
aws s3 cp "$source_uri.sha256" "$workdir/$name.sha256" --only-show-errors
(cd "$workdir" && sha256sum -c "$name.sha256")
gzip -t "$workdir/$name"

"${compose[@]}" up -d restore-test
ready=0
for _ in {1..60}; do
  if "${compose[@]}" exec -T restore-test sh /usr/local/bin/ontop-admin-client.sh mysql \
    --batch --skip-column-names -e 'SELECT 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ $ready -ne 1 ]]; then
  "${compose[@]}" logs --tail=50 restore-test >&2
  echo 'Restore test MySQL did not become ready.' >&2
  exit 1
fi

gzip -dc "$workdir/$name" | "${compose[@]}" exec -T restore-test sh /usr/local/bin/ontop-admin-client.sh mysql
"${compose[@]}" exec -T restore-test sh /usr/local/bin/ontop-admin-client.sh mysql \
  --batch --skip-column-names \
  -e "SELECT 'restored_tables', COUNT(*) FROM information_schema.tables WHERE table_schema = 'ontop';"
if [[ -n ${expected_table:-} ]]; then
  actual_rows=$("${compose[@]}" exec -T restore-test sh /usr/local/bin/ontop-admin-client.sh mysql \
    --batch --skip-column-names -e "SELECT COUNT(*) FROM ontop.$expected_table;")
  if [[ $actual_rows != "$expected_rows" ]]; then
    echo "Restore row count mismatch for $expected_table: expected $expected_rows, found $actual_rows." >&2
    exit 1
  fi
  echo "Restored $expected_table row count: $actual_rows (expected $expected_rows)."
else
  echo 'Isolated restore completed. Compare representative row counts with the source before accepting recovery.'
fi
