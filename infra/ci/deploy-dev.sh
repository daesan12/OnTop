#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 1 )) || [[ ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Usage: sudo ontop-deploy-dev FULL_GIT_SHA' >&2
  exit 2
fi

sha=$1
image="wooaw/ontop-backend:sha-$sha"
env_file=/etc/ontop/dev-app/deploy.env
compose_file=/opt/ontop/infra/app/compose.dev.yaml
record_dir=/var/lib/ontop/ci
record_file=$record_dir/dev-deployments.tsv

exec 9>/run/lock/ontop-dev-deploy.lock
flock -n 9 || { echo 'Another dev deployment is active.' >&2; exit 1; }

[[ -f $env_file && -f $compose_file ]] || { echo 'Dev deployment configuration is missing.' >&2; exit 1; }
docker image inspect "$image" >/dev/null

old_image=$(sed -n 's/^BACKEND_IMAGE=//p' "$env_file" | head -n 1)
[[ -n $old_image ]] || { echo 'BACKEND_IMAGE is missing.' >&2; exit 1; }
if [[ $old_image == "$image" ]]; then
  echo "Dev already uses $image."
  exit 0
fi
docker image inspect "$old_image" >/dev/null

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

set_image() {
  local target=$1 temp
  temp=$(mktemp "${env_file}.XXXXXX")
  awk -v image="$target" '
    /^BACKEND_IMAGE=/ { print "BACKEND_IMAGE=" image; found=1; next }
    { print }
    END { if (!found) exit 1 }
  ' "$env_file" > "$temp" || { rm -f -- "$temp"; return 1; }
  chown root:root "$temp"
  chmod 0600 "$temp"
  mv -f -- "$temp" "$env_file"
}

healthy() {
  local status
  for _ in $(seq 1 36); do
    status=$(docker inspect --format '{{.State.Health.Status}}' ontop-dev-app-app-1 2>/dev/null || true)
    if [[ $status == healthy ]] && curl --fail --silent --show-error --max-time 5 \
      https://dev-api.on-top.world/actuator/health >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

set_image "$image"
if ! compose config --quiet || ! compose up -d --no-deps app || ! healthy; then
  echo 'Dev deploy failed; restoring the previous image.' >&2
  set_image "$old_image"
  compose up -d --no-deps app
  healthy || echo 'Rollback health check failed; investigate immediately.' >&2
  exit 1
fi

install -d -m 0750 "$record_dir"
image_id=$(docker image inspect --format '{{.Id}}' "$image")
printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$sha" "$image" "$image_id" "$old_image" >> "$record_file"
chmod 0640 "$record_file"
echo "Dev deployed $image and passed health checks."
