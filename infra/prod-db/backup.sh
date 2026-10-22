#!/usr/bin/env bash
set -euo pipefail
umask 077

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
trap 'rm -rf -- "$workdir"' EXIT
name="ontop-prod-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
archive="$workdir/$name"
compose=(docker compose --env-file "$config_file" -f "$script_dir/compose.yaml")

"${compose[@]}" exec -T mysql sh /usr/local/bin/ontop-admin-client.sh mysqldump \
  --single-transaction --quick --routines --events --triggers \
  --hex-blob --no-tablespaces --set-gtid-purged=OFF \
  --databases ontop | gzip -c > "$archive"
gzip -t "$archive"
(cd "$workdir" && sha256sum "$name" > "$name.sha256")

destination="${BACKUP_S3_URI%/}/$name"
aws s3 cp "$archive" "$destination" --sse AES256 --only-show-errors
aws s3 cp "$archive.sha256" "$destination.sha256" --sse AES256 --only-show-errors
echo "Uploaded $destination and its SHA-256 checksum."
