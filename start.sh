#!/usr/bin/env bash
set -e

PID_FILE=".web-log_term.pid"

echo "Starte Docker Compose Stack..."
docker compose up -d

echo "Warte bis alle Container laufen..."

# Warte-Schleife bis alle Container den Status "running" haben
while true; do
    # Anzahl aller Container im Projekt
    total=$(docker compose ps -q | wc -l)

    # Anzahl laufender Container
    running=$(docker compose ps -q | xargs -r docker inspect -f '{{.State.Running}}' | grep -c true || true)

    if [ "$total" -gt 0 ] && [ "$total" -eq "$running" ]; then
        echo "Alle Container laufen."
        break
    fi

    echo "Container noch nicht bereit... ($running/$total)"
    sleep 2
done

echo "Öffne neues GNOME Terminal mit Web-Logs..."
gnome-terminal -- bash -lc "echo \$\$ > '$PID_FILE'; exec docker compose logs -f web"

echo "Starte Bash im Codex Container ..."
exec docker compose exec -it codex bash
