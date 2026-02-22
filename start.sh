#!/usr/bin/env bash
set -euo pipefail

# Start new terminal with Web-Container
gnome-terminal -- bash -lc "exec docker compose run --rm --service-ports web"

# Start Codex-Container in this terminal
exec docker compose run --rm codex

## How to stop: type "/exit" in codex terminal and press Ctrl-C in Web terminal
## Both containers will be shut down automatically
