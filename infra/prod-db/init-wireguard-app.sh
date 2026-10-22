#!/usr/bin/env bash
set -euo pipefail
umask 077

if (( EUID != 0 )) || (( $# != 2 )); then
  echo "Usage: sudo bash init-wireguard-app.sh DB_PUBLIC_KEY DB_PUBLIC_IP" >&2
  exit 2
fi

db_public_key=$1
db_public_ip=$2
if [[ ! $db_public_key =~ ^[A-Za-z0-9+/]{43}=$ ]] || [[ ! $db_public_ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid DB public key or IPv4 address." >&2
  exit 1
fi

config_dir=/etc/wireguard
install -d -m 0700 "$config_dir"
for name in privatekey publickey wg0.conf; do
  if [[ -e $config_dir/$name ]]; then
    echo "Refusing to overwrite $config_dir/$name" >&2
    exit 1
  fi
done

wg genkey > "$config_dir/privatekey"
wg pubkey < "$config_dir/privatekey" > "$config_dir/publickey"
{
  printf '[Interface]\nAddress = 10.77.0.2/30\nPrivateKey = '
  cat "$config_dir/privatekey"
  printf '\n[Peer]\nPublicKey = %s\nEndpoint = %s:51820\nAllowedIPs = 10.77.0.1/32\nPersistentKeepalive = 25\n' "$db_public_key" "$db_public_ip"
} > "$config_dir/wg0.conf"
chmod 0600 "$config_dir/privatekey" "$config_dir/publickey" "$config_dir/wg0.conf"

systemctl enable --now wg-quick@wg0
ip -4 addr show dev wg0
echo "PROD-APP public key:"
cat "$config_dir/publickey"
