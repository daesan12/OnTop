#!/usr/bin/env bash
set -euo pipefail
umask 077

secret_dir=/etc/ontop/prod-db/secrets
if [[ $EUID -ne 0 ]]; then
  echo 'Run as root on PROD-DB.' >&2
  exit 1
fi

install -d -m 0700 "$secret_dir"
for name in mysql-root-password mysql-app-password; do
  if [[ -e "$secret_dir/$name" ]]; then
    echo "Refusing to overwrite $secret_dir/$name" >&2
    exit 1
  fi
done

openssl rand -hex 32 > "$secret_dir/mysql-root-password"
openssl rand -hex 32 > "$secret_dir/mysql-app-password"
chmod 0600 "$secret_dir"/*
echo "Created two root-owned secret files under $secret_dir. No values were printed."
