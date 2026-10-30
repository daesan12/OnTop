#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 1 )); then
  echo 'Usage: sudo stage-generated-map.sh SOURCE_REPOSITORY_ROOT' >&2
  exit 2
fi

source_root=$(realpath -- "$1")
script_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
python3 "$script_root/infra/ci/check_park_handoff.py" --source-root "$source_root"

version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["mapVersion"])' \
  "$source_root/frontend/generated/park/manifest.json")
[[ $version =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid mapVersion.' >&2; exit 1; }

release_root=/opt/ontop/maps
release=$release_root/$version
install -d -o root -g root -m 0755 "$release_root"
if [[ -L $release ]]; then
  echo 'Map release path must not be a symlink.' >&2
  exit 1
fi
if [[ -e $release ]]; then
  cmp -s -- "$source_root/frontend/generated/park/server-map.json" "$release/server-map.json" && \
    cmp -s -- "$source_root/frontend/generated/park/manifest.json" "$release/manifest.json" || {
      echo 'An existing map release has different bytes.' >&2
      exit 1
    }
  echo "$release"
  exit 0
fi

staging=$(mktemp -d "$release_root/.stage.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT
install -o root -g root -m 0644 \
  "$source_root/frontend/generated/park/server-map.json" "$staging/server-map.json"
install -o root -g root -m 0644 \
  "$source_root/frontend/generated/park/manifest.json" "$staging/manifest.json"
chmod 0755 "$staging"
mv -- "$staging" "$release"
trap - EXIT
echo "$release"
