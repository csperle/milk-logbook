#!/usr/bin/env bash
set -e

PID_FILE=".web-log_term.pid"

echo "Schliesse Web-Log Terminal..."

if [ -f "$PID_FILE" ]; then
  pid=$(cat "$PID_FILE" || true)

  if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then
    kill -HUP "$pid" || true
  fi

  rm -f "$PID_FILE"
fi

echo "Stoppe Docker Compose Stack..."

docker compose down

echo "Alles gestoppt."
