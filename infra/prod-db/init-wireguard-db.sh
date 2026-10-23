#!/usr/bin/env bash
set -euo pipefail
umask 077

if (( EUID != 0 )); then
  echo "Run as root on PROD-DB." >&2
  exit 2
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
  printf '[Interface]\nAddress = 10.77.0.1/30\nListenPort = 51820\nPrivateKey = '
  cat "$config_dir/privatekey"
} > "$config_dir/wg0.conf"
chmod 0600 "$config_dir/privatekey" "$config_dir/publickey" "$config_dir/wg0.conf"

systemctl enable --now wg-quick@wg0
ip -4 addr show dev wg0
echo "WireGuard interface is ready without a peer. Add PROD-APP after exchanging public keys."
