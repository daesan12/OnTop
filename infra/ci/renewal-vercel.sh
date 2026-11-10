#!/usr/bin/env bash
set -euo pipefail
set +x
[[ $# == 1 && $1 =~ ^(prepare|deploy)$ ]] || { echo 'Usage: renewal-vercel.sh prepare|deploy' >&2; exit 2; }
: "${SOURCE_SHA:?Set the committed source SHA}"
: "${PARK_RELEASE_ID:?Set the verified shared release ID}"
: "${VERCEL_TOKEN:?Use the existing Jenkins credential}"
: "${VERCEL_ORG_ID:?Use the existing dev Vercel organization}"
[[ ${VERCEL_PROJECT_ID:-} == prj_q9105AHzFQmB1Bu2FkjmDfsrkKi9 ]] || {
  echo 'Only the separate ontop-frontend-dev project is allowed.' >&2; exit 1;
}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
release="$root/frontend/generated/park-renewal/releases/$PARK_RELEASE_ID"
python3 "$root/infra/ci/check_park_renewal.py" --source-root "$root" --source-sha "$SOURCE_SHA" --require-clean
cd "$root/frontend"
if [[ $1 == prepare ]]; then
  # Pull/build read settings and compile only; no deployment or domain promotion.
  vercel pull --yes --environment=production --local-config vercel.renewal.json --token "$VERCEL_TOKEN"
  python3 - "$VERCEL_PROJECT_ID" <<'PY'
import json,sys
with open('.vercel/project.json') as file: project=json.load(file)
if project['projectId'] != sys.argv[1]: raise SystemExit('Vercel metadata belongs to a different project')
PY
  vercel build --prod --local-config vercel.renewal.json --token "$VERCEL_TOKEN"
fi
python3 "$root/infra/ci/check_park_renewal.py" --source-root "$root" --source-sha "$SOURCE_SHA" \
  --require-clean --dist "$root/frontend/.vercel/output/static"
if [[ $1 == deploy ]]; then
  # Deploy exactly the checked prebuilt FE, only after the matching BE is healthy.
  python3 "$root/infra/ci/check_live_renewal.py" --release-dir "$release" --source-sha "$SOURCE_SHA"
  vercel deploy --prebuilt --prod --yes --local-config vercel.renewal.json --token "$VERCEL_TOKEN" > vercel-deployment-url.txt
  python3 "$root/infra/ci/check_live_renewal.py" --release-dir "$release" --source-sha "$SOURCE_SHA" \
    --public-url https://dev.on-top.world
  cat vercel-deployment-url.txt
fi
