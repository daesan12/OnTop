#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo 'Run this script as root.' >&2
  exit 2
fi

version=24.18.0
archive="node-v${version}-linux-x64.tar.xz"
base="https://nodejs.org/dist/v${version}"
target="/opt/node-v${version}"

if [[ ! -x "$target/bin/node" ]]; then
  scratch=$(mktemp -d)
  trap 'rm -rf -- "$scratch"' EXIT
  curl -fsSLo "$scratch/$archive" "$base/$archive"
  curl -fsSLo "$scratch/SHASUMS256.txt" "$base/SHASUMS256.txt"
  (
    cd "$scratch"
    grep -F " $archive" SHASUMS256.txt | sha256sum --check --status
  )
  mkdir -p "$target"
  tar -xJf "$scratch/$archive" -C "$target" --strip-components=1
fi

for program in node npm npx; do
  ln -sfn "$target/bin/$program" "/usr/local/bin/$program"
done

node --version
npm --version
