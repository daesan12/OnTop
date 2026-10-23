#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo 'Run this script as root.' >&2
  exit 2
fi

env_file=/etc/ontop/dev-app/deploy.env
[[ -f $env_file ]] || { echo 'Existing dev deploy.env is missing.' >&2; exit 1; }
install -d -m 0700 /etc/ontop/dev-ci/tls

if ! grep -q '^CI_NGINX_CONFIG_FILE=' "$env_file"; then
  printf '\nCI_NGINX_CONFIG_FILE=/opt/ontop/infra/ci/nginx/tls.conf\n' >> "$env_file"
fi
if ! grep -q '^CI_TLS_DIR=' "$env_file"; then
  printf 'CI_TLS_DIR=/etc/ontop/dev-ci/tls\n' >> "$env_file"
fi
chown root:root "$env_file"
chmod 0600 "$env_file"

docker compose --env-file "$env_file" -f /opt/ontop/infra/app/compose.dev.yaml config --quiet
echo 'CI Nginx settings are present; existing app credentials were not changed.'
