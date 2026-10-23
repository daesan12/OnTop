#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 2 )); then
  echo "Usage: sudo $0 CERTBOT_DOMAIN TLS_DIR" >&2
  exit 2
fi

domain=$1
target=$2
if [[ ! $domain =~ ^[A-Za-z0-9.-]+$ || $target != /* || $target == / ]]; then
  echo 'Invalid domain or absolute TLS directory.' >&2
  exit 2
fi

source_dir="/etc/letsencrypt/live/$domain"
if [[ ! -f $source_dir/fullchain.pem || ! -f $source_dir/privkey.pem ]]; then
  echo "Certificate files are missing for $domain." >&2
  exit 1
fi

install -d -m 0700 "$target"
install -m 0644 "$source_dir/fullchain.pem" "$target/fullchain.pem.new"
install -m 0600 "$source_dir/privkey.pem" "$target/privkey.pem.new"
mv -f "$target/fullchain.pem.new" "$target/fullchain.pem"
mv -f "$target/privkey.pem.new" "$target/privkey.pem"
echo "Copied certificate for $domain; reload Nginx to use it."
