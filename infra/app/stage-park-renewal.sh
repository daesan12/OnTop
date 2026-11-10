#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 1 )); then
  echo 'Usage: sudo stage-park-renewal.sh SOURCE_REPOSITORY_ROOT' >&2
  exit 2
fi
source_root=$(realpath -- "$1")
script_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
python3 "$script_root/infra/ci/check_park_renewal.py" --source-root "$source_root"
version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["releaseId"])' \
  "$source_root/frontend/generated/park-renewal/release.json")
[[ $version =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid map version.' >&2; exit 1; }
source_dir=$source_root/frontend/generated/park-renewal/releases/$version
release_root=/opt/ontop/park-renewal
release=$release_root/$version
files=(release.json server-map.local.json server-manifest.local.json course.local.json course.local.sha256 park-bindings.local.json)
install -d -o root -g root -m 0755 "$release_root"
[[ ! -L $release ]] || { echo 'Release path must not be a symlink.' >&2; exit 1; }
if [[ -e $release ]]; then
  for file in "${files[@]}"; do
    cmp -s -- "$source_dir/$file" "$release/$file" || { echo 'Existing release differs.' >&2; exit 1; }
  done
  echo "$release"
  exit 0
fi
staging=$(mktemp -d "$release_root/.stage.XXXXXXXX")
cleanup() { [[ $staging == "$release_root"/.stage.* ]] && rm -rf -- "$staging"; }
trap cleanup EXIT
for file in "${files[@]}"; do
  install -o root -g root -m 0644 "$source_dir/$file" "$staging/$file"
done
chmod 0755 "$staging"
mv -- "$staging" "$release"
trap - EXIT
echo "$release"
