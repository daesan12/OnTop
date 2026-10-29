#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
config_file=${ONTOP_DB_CONFIG:-/etc/ontop/prod-db/compose.env}
if [[ ! -r $config_file ]]; then
  echo "Cannot read $config_file" >&2
  exit 1
fi
set -a
# The root-owned file contains only trusted non-secret KEY=value lines.
source "$config_file"
set +a
: "${DB_DATA_DIR:?}"
: "${DB_WG_IP:?}"

if ! mountpoint -q "$DB_DATA_DIR"; then
  echo "EBS is not mounted at $DB_DATA_DIR; refusing to start MySQL." >&2
  exit 1
fi
if ! ip -4 addr show dev wg0 | grep -Fq "inet ${DB_WG_IP}/"; then
  echo "WireGuard address $DB_WG_IP is not ready; refusing to start MySQL." >&2
  exit 1
fi

docker compose --env-file "$config_file" -f "$script_dir/compose.yaml" config --quiet
docker compose --env-file "$config_file" -f "$script_dir/compose.yaml" up -d mysql
docker compose --env-file "$config_file" -f "$script_dir/compose.yaml" ps mysql
