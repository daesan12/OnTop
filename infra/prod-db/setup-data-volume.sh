#!/usr/bin/env bash
set -euo pipefail

# Run only on a new, empty PROD-DB data EBS volume.
if (( EUID != 0 )) || (( $# != 2 )); then
  echo "Usage: sudo bash setup-data-volume.sh /dev/nvmeXn1 volXXXXXXXX" >&2
  exit 2
fi

device=$1
expected_serial=${2//-/}
mount_dir=/srv/ontop/mysql

if [[ ! -b $device || $expected_serial != vol* ]]; then
  echo "Invalid block device or EBS volume serial." >&2
  exit 1
fi

actual_serial=$(lsblk -dn -o SERIAL "$device" | tr -d '[:space:]-')
if [[ $actual_serial != "$expected_serial" ]]; then
  echo "EBS volume serial mismatch: $actual_serial" >&2
  exit 1
fi

if [[ $(lsblk -nrpo NAME "$device" | wc -l) -ne 1 ]]; then
  echo "Device has partitions; refusing to format." >&2
  exit 1
fi

if [[ -n $(wipefs --no-act --all "$device") ]] || blkid "$device" >/dev/null 2>&1; then
  echo "Device has an existing filesystem or signature; refusing to format." >&2
  exit 1
fi

if grep -Eq "^[^#]+[[:space:]]+$mount_dir[[:space:]]" /etc/fstab; then
  echo "Mount point already exists in /etc/fstab; refusing to modify." >&2
  exit 1
fi

mkdir -p "$mount_dir"
if mountpoint -q "$mount_dir" || [[ -n $(find "$mount_dir" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
  echo "Mount directory is mounted or not empty; refusing to modify." >&2
  exit 1
fi

mkfs.ext4 -L ontop-mysql "$device"
uuid=$(blkid -s UUID -o value "$device")
[[ -n $uuid ]] || { echo "Could not read filesystem UUID." >&2; exit 1; }

cp /etc/fstab "/etc/fstab.before-ontop-db-$(date -u +%Y%m%dT%H%M%SZ)"
printf 'UUID=%s %s ext4 defaults 0 2\n' "$uuid" "$mount_dir" >> /etc/fstab
mount "$mount_dir"
findmnt -no SOURCE,FSTYPE,TARGET "$mount_dir"
