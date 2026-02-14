FROM node:20-trixie-slim

# Basics, die Codex/Dev brauchen
RUN apt-get update && apt-get install -y \
    git bash ca-certificates curl \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# user-local npm prefix
ENV HOME=/home/node
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=/home/node/.npm-global/bin:$PATH

# Verzeichnisse anlegen, Meine Custom Prompts in den Container kopieren und Rechte setzen
RUN mkdir -p /home/node/.npm-global /home/node/.codex /workspace
COPY .codex/prompts /home/node/.codex
RUN chown -R node:node /home/node /workspace

# ab hier als user node weiter, damit später auch Updates/Schreiben gehen
USER node

# Codex CLI installieren (offiziell via npm)
RUN npm install -g @openai/codex@latest

WORKDIR /workspace

EXPOSE 3000
CMD ["bash"]
