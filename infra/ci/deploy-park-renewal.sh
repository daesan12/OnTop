#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 3 )) || [[ ! $1 =~ ^--(check|apply)$ || ! $2 =~ ^[0-9a-f]{40}$ || ! $3 =~ ^[0-9a-f]{64}$ ]]; then
  echo 'Usage: sudo ontop-deploy-park-renewal --check|--apply SOURCE_SHA RELEASE_ID' >&2
  exit 2
fi
action=$1
sha=$2
release_id=$3
image="wooaw/ontop-backend:sha-$sha"
root=/opt/ontop
release="$root/park-renewal/$release_id"
env_file=/etc/ontop/dev-app/park-renewal.deploy.env
marker=/etc/ontop/dev-app/park-renewal.enabled
record_dir=/var/lib/ontop/ci/park-renewal
compose_file=$root/infra/app/compose.dev.yaml
renewal_compose=$root/infra/app/compose.park-renewal.yaml
coop_compose=$root/infra/app/compose.skewer-coop.yaml
monitoring_marker=/etc/ontop/dev-app/monitoring.enabled
monitoring_compose=$root/infra/monitoring/dev/compose.app.yaml
observe_compose=$root/infra/app/compose.park-renewal-observe.yaml

[[ -f $env_file && ! -L $env_file && $(stat -c '%u:%g:%a' "$env_file") == 0:0:600 ]] || {
  echo 'Prepare the root-owned 0600 renewal deploy.env from the existing deployment settings.' >&2; exit 1;
}
value() { sed -n "s/^$1=//p" "$env_file" | head -n 1; }
[[ $(value PARK_RENEWAL_SOURCE_SHA) == "$sha" && $(value PARK_RENEWAL_RELEASE_ID) == "$release_id" \
   && $(value PARK_RENEWAL_HOST_DIR) == "$release" && $(value BACKEND_IMAGE) == "$image" ]] || {
  echo 'Approved environment does not match this source/release/image.' >&2; exit 1;
}
[[ -d $release && ! -L $release && -f $compose_file && -f $renewal_compose && -f $coop_compose ]] || {
  echo 'Stage the immutable release and install the reviewed Compose files first.' >&2; exit 1;
}
python3 - "$root" "$release" "$sha" "$release_id" <<'PY'
import sys
from pathlib import Path
root, directory, sha, identity = sys.argv[1:]
sys.path.insert(0, str(Path(root) / 'infra/ci'))
from renewal_release import read_json, validate_bundle
validate_bundle(directory, read_json(Path(root) / 'frontend/park-renewal-baseline.json'), sha, identity)
PY
journal=$(value SKEWER_COOP_JOURNAL_HOST_DIR)
[[ $journal == /* && -d $journal && ! -L $journal && $(stat -c '%u:%g:%a' "$journal") == 10001:10001:700 ]] || {
  echo 'Preserve the existing persistent coop journal, owned by 10001:10001 with mode 0700.' >&2; exit 1;
}
compose_args=(--env-file "$env_file" -f "$compose_file")
monitoring=0
if [[ -f $monitoring_marker ]]; then
  [[ -f $monitoring_compose && -f $observe_compose ]] || { echo 'Missing monitoring override.' >&2; exit 1; }
  compose_args+=(-f "$monitoring_compose")
  monitoring=1
fi
# Never include compose.generated-map.yaml in a renewal deployment.
compose_args+=(-f "$renewal_compose" -f "$coop_compose")
if (( monitoring )); then compose_args+=(-f "$observe_compose"); fi
compose() { docker compose "${compose_args[@]}" "$@"; }
compose config --quiet
if [[ $action == --check ]]; then
  echo "Renewal preflight passed: $sha $release_id (no service or DB changes)."
  exit 0
fi

exec 9>/run/lock/ontop-dev-deploy.lock
flock -n 9 || { echo 'Another dev deployment is active.' >&2; exit 1; }
docker image inspect "$image" >/dev/null
install -d -o root -g root -m 0700 "$record_dir/$release_id"
old_image=$(docker inspect --format '{{.Config.Image}}' ontop-dev-app-app-1)
record="$record_dir/$release_id/attempt-$(date -u +%Y%m%dT%H%M%SZ).txt"
printf 'source=%s\nrelease=%s\nprevious_image=%s\ntarget_image=%s\n' "$sha" "$release_id" "$old_image" "$image" > "$record"
chmod 0600 "$record"
# Retain configuration snapshots without copying app.env, DB passwords or the journal.
install -o root -g root -m 0600 "$env_file" "$record_dir/$release_id/renewal.deploy.env"
if [[ -f /etc/ontop/dev-app/deploy.env && ! -e $record_dir/$release_id/previous.deploy.env ]]; then
  install -o root -g root -m 0600 /etc/ontop/dev-app/deploy.env "$record_dir/$release_id/previous.deploy.env"
fi
if [[ -f $marker && ! -e $record_dir/$release_id/previous.marker ]]; then
  install -o root -g root -m 0600 "$marker" "$record_dir/$release_id/previous.marker"
fi
marker_temp=$(mktemp "${marker}.XXXXXX")
printf '%s\n' "$release_id" > "$marker_temp"
chmod 0600 "$marker_temp"
chown root:root "$marker_temp"
mv -f -- "$marker_temp" "$marker"
healthy() {
  local status
  for _ in $(seq 1 36); do
    status=$(docker inspect --format '{{.State.Health.Status}}' ontop-dev-app-app-1 2>/dev/null || true)
    if [[ $status == healthy ]]; then
      if (( monitoring )); then
        docker exec ontop-dev-app-app-1 curl --fail --silent --show-error --max-time 5 \
          http://127.0.0.1:8082/actuator/health >/dev/null && return 0
      else
        curl --fail --silent --show-error --max-time 5 \
          https://dev-api.on-top.world/actuator/health >/dev/null && return 0
      fi
    fi
    sleep 5
  done
  return 1
}
if ! compose up -d --no-deps app || ! healthy || ! python3 "$root/infra/ci/check_live_renewal.py" \
    --release-dir "$release" --source-sha "$sha"; then
  printf 'status=FAILED\n' >> "$record"
  echo 'BE transition failed. FE must not be promoted; keep admission closed.' >&2
  echo 'No automatic image rollback: V167 may already be applied. Use the reviewed FE/BE/map/DB compatibility plan.' >&2
  exit 1
fi
printf 'status=BE_VERIFIED\n' >> "$record"
echo "Renewal BE healthy and verified: $sha $release_id. FE and dev smoke checks still required."
