#!/usr/bin/env bash
set -euo pipefail

# Certbot supplies a space-separated list of names renewed in this lineage.
if [[ " ${RENEWED_DOMAINS:-} " != *" api.on-top.world "* ]]; then
  exit 0
fi

/opt/ontop/infra/app/sync-cert.sh api.on-top.world /etc/ontop/prod-app/tls

container_id=$(docker ps \
  --filter label=com.docker.compose.project=ontop-prod-app \
  --filter label=com.docker.compose.service=nginx \
  --format '{{.ID}}' | head -n 1)

if [[ -z "$container_id" ]]; then
  container_id=$(docker ps --filter name=ontop-tls-bootstrap --format '{{.ID}}' | head -n 1)
fi

if [[ -n "$container_id" ]]; then
  docker exec "$container_id" nginx -s reload
fi
