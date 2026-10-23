#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 1 )); then
  echo "Usage: sudo bash $0 BACKEND_IMAGE" >&2
  exit 2
fi

image=$1
if [[ ! $image =~ ^[A-Za-z0-9._/-]+:[A-Za-z0-9._-]+$ ]]; then
  echo 'Supply a tagged backend image.' >&2
  exit 2
fi

app_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
target=/etc/ontop/dev-app
umask 077
install -d -m 0700 "$target" "$target/secrets" "$target/tls"
install -d -m 0755 /srv/ontop/dev-app/acme

if [[ ! -e $target/secrets/mysql-root-password ]]; then
  openssl rand -hex 32 > "$target/secrets/mysql-root-password"
fi
if [[ ! -e $target/secrets/mysql-app-password ]]; then
  openssl rand -hex 32 > "$target/secrets/mysql-app-password"
fi
chown root:root "$target/secrets/mysql-root-password"
chmod 0600 "$target/secrets/mysql-root-password"
chown root:10001 "$target/secrets/mysql-app-password"
chmod 0640 "$target/secrets/mysql-app-password"

python3 - "$app_dir" "$target" "$image" <<'PY'
import base64
import os
import secrets
import sys
from pathlib import Path

source, target, image = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]

def create_once(path: Path, content: str) -> None:
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        output.write(content)

app_env = (source / "dev.app.env.example").read_text(encoding="utf-8")
jwt_secret = base64.b64encode(secrets.token_bytes(48)).decode("ascii")
app_env = app_env.replace("REPLACE_WITH_DIFFERENT_BASE64_RANDOM_SECRET", jwt_secret)
app_env = app_env.replace("SSAFY_CLIENT_ID=REPLACE_WITH_DEV_CLIENT_ID", "SSAFY_CLIENT_ID=")
app_env = app_env.replace("SSAFY_CLIENT_SECRET=REPLACE_WITH_DEV_CLIENT_SECRET", "SSAFY_CLIENT_SECRET=")
create_once(target / "app.env", app_env)

deploy_env = (source / "dev.deploy.env.example").read_text(encoding="utf-8")
deploy_env = deploy_env.replace("BACKEND_IMAGE=wooaw/ontop-backend:manual", f"BACKEND_IMAGE={image}")
create_once(target / "deploy.env", deploy_env)
PY

chown root:root "$target/app.env" "$target/deploy.env"
chmod 0600 "$target/app.env" "$target/deploy.env"
echo 'Created DEV-CI settings and secrets under /etc/ontop/dev-app.'
