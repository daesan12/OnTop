#!/usr/bin/env bash
set -euo pipefail

if (( $# != 1 )) || [[ $1 != full && $1 != handoff ]]; then
  echo 'Usage: run-generated-map-tests.sh full|handoff' >&2
  exit 2
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
handoff=$(mktemp -d)
trap 'rm -rf -- "$handoff"' EXIT
python3 "$root/infra/ci/check_park_handoff.py" --source-root "$root" --prepare-dir "$handoff"
export TEST_GENERATED_MAP_DIR=$handoff

cd "$root/backend"
started=$SECONDS
result=0
if [[ $1 == full ]]; then
  ./gradlew --no-daemon test || result=$?
else
  ./gradlew --no-daemon test --rerun-tasks \
    --tests '*GeneratedParkMapHandoffTests' \
    --tests '*PreparedParkMapHandoffTests' \
    --tests '*PreparedParkMovementTests' \
    --tests '*PreparedParkSocketTests' \
    --tests '*GeneratedWorldMapRuntimeTests' \
    --tests '*WorldMapSelectionWebSocketTests' || result=$?
fi

if [[ -d build/test-results/test ]]; then
  python3 "$root/infra/ci/report_test_times.py" build/test-results/test \
    --wall-seconds "$((SECONDS - started))" || true
fi
if (( result == 0 )); then
  python3 "$root/infra/ci/check_park_handoff.py" --verify-results build/test-results/test
else
  exit "$result"
fi
