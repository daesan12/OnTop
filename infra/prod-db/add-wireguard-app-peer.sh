#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )) || (( $# != 1 )); then
  echo "Usage: sudo bash add-wireguard-app-peer.sh PROD_APP_PUBLIC_KEY" >&2
  exit 2
fi

app_public_key=$1
if [[ ! $app_public_key =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
  echo "Invalid WireGuard public key." >&2
  exit 1
fi

config=/etc/wireguard/wg0.conf
if [[ ! -f $config ]] || ! systemctl is-active --quiet wg-quick@wg0; then
  echo "PROD-DB WireGuard interface is not ready." >&2
  exit 1
fi

if grep -Eq '^\[Peer\][[:space:]]*$' "$config"; then
  echo "A peer is already configured; refusing to append another." >&2
  exit 1
fi

wg set wg0 peer "$app_public_key" allowed-ips 10.77.0.2/32
printf '\n[Peer]\nPublicKey = %s\nAllowedIPs = 10.77.0.2/32\n' "$app_public_key" >> "$config"
chmod 0600 "$config"
wg show wg0 peers
