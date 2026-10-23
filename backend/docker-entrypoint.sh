#!/bin/sh
set -eu

if [ -n "${DB_PASSWORD_FILE:-}" ]; then
  if [ -n "${DB_PASSWORD:-}" ]; then
    echo 'Set either DB_PASSWORD_FILE or DB_PASSWORD, not both.' >&2
    exit 1
  fi
  if [ ! -r "$DB_PASSWORD_FILE" ]; then
    echo 'DB_PASSWORD_FILE is not readable.' >&2
    exit 1
  fi
  DB_PASSWORD=$(cat "$DB_PASSWORD_FILE")
  if [ -z "$DB_PASSWORD" ]; then
    echo 'DB_PASSWORD_FILE is empty.' >&2
    exit 1
  fi
  export DB_PASSWORD
fi

exec java -jar /app/app.jar
