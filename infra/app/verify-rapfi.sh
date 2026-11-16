#!/usr/bin/env bash
set -euo pipefail

if (( $# != 1 )) || [[ ! $1 =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  echo 'Usage: verify-rapfi.sh BACKEND_CONTAINER_NAME' >&2
  exit 2
fi
output=$(printf '%s\n' 'START 15' 'INFO rule 4' 'INFO thread_num 1' \
  'INFO hash_size 16384' 'INFO timeout_turn 300' 'INFO max_depth 16' \
  'INFO show_detail 2' 'INFO pondering 0' 'BOARD' '7,7,2' 'DONE' | \
  timeout 8s docker exec -i "$1" /bin/sh -c \
    'cd /run/ontop/rapfi && exec ./rapfi')
grep -Eq '^[0-9]{1,2},[0-9]{1,2}\r?$' <<< "$output"
grep -q '^INFO WINRATE ' <<< "$output"
grep -q 'mix9svqrenju_bs15_white.bin.lz4' <<< "$output"
echo 'Rapfi Renju weights, evaluation, and move response: OK'
