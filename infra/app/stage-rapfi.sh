#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 1 )); then
  echo 'Usage: sudo stage-rapfi.sh EXTRACTED_RAPFI_250615_DIRECTORY' >&2
  exit 2
fi
[[ $(uname -m) == x86_64 ]] || { echo 'This pinned release requires x86_64.' >&2; exit 1; }
source_dir=$(realpath -- "$1")
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
manifest=$script_dir/rapfi-250615.sha256
(cd "$source_dir" && sha256sum --check --strict "$manifest")
binary=pbrain-rapfi-linux-clang-sse
if grep -qw avx2 /proc/cpuinfo; then binary=pbrain-rapfi-linux-clang-avx2; fi
release_root=/opt/ontop/rapfi
release=$release_root/250615
exec 9>/run/lock/ontop-rapfi-stage.lock
flock -n 9 || { echo 'Another Rapfi staging operation is active.' >&2; exit 1; }
[[ ! -L $release_root && ! -L $release ]] || { echo 'Rapfi release paths must not be symlinks.' >&2; exit 1; }
install -d -o root -g root -m 0755 "$release_root"
if [[ -e $release ]]; then
  (cd "$release" && sha256sum --check --strict "$manifest")
  cmp -s -- "$release/$binary" "$release/rapfi" || { echo 'Existing executable differs; use a coordinated new release.' >&2; exit 1; }
  echo "$release"
  exit 0
fi
staging=$(mktemp -d "$release_root/.stage.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT
while read -r hash name; do
  [[ -f $source_dir/$name && ! -L $source_dir/$name ]] || { echo 'Expected regular release file.' >&2; exit 1; }
  install -o root -g root -m 0644 "$source_dir/$name" "$staging/$name"
done < "$manifest"
install -o root -g root -m 0755 "$source_dir/$binary" "$staging/rapfi"
(cd "$staging" && sha256sum --check --strict "$manifest")
cmp -s -- "$staging/$binary" "$staging/rapfi"
chmod 0755 "$staging"
mv -- "$staging" "$release"
trap - EXIT
echo "$release"
