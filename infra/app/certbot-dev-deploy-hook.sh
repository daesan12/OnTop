#!/usr/bin/env bash
set -euo pipefail

if [[ " ${RENEWED_DOMAINS:-} " != *" dev-api.on-top.world "* ]]; then
  exit 0
fi

/opt/ontop/infra/app/sync-cert.sh dev-api.on-top.world /etc/ontop/dev-app/tls

container_id=$(docker ps \
  --filter label=com.docker.compose.project=ontop-dev-app \
  --filter label=com.docker.compose.service=nginx \
  --format '{{.ID}}' | head -n 1)

if [[ -n "$container_id" ]]; then
  docker exec "$container_id" nginx -s reload
fi
