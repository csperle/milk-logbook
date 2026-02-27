# Debian stable
FROM node:20-trixie-slim

# codex version (can be overridden at build time)
ARG CODEX_VERSION=0.106.0

# Avoid interactive apt prompts
ENV DEBIAN_FRONTEND=noninteractive

# HOME, PATH and user-local npm prefix
ENV HOME=/home/node \
    PATH=/home/node/.npm-global/bin:$PATH \
    NPM_CONFIG_PREFIX=/home/node/.npm-global \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# Install without recommended extras
RUN apt-get update && apt-get install -y --no-install-recommends \
      git bash ca-certificates curl \
      python3 make g++ procps ripgrep \
      tini \
    && rm -rf /var/lib/apt/lists/*

# Create dirs (root) and chown to node
RUN mkdir -p /home/node/.npm-global /home/node/.codex /workspace \
    && chown -R node:node /home/node /workspace

USER node

# Install Codex CLI
RUN npm install -g @openai/codex@${CODEX_VERSION} \
 && npm cache clean --force

WORKDIR /workspace

ENTRYPOINT ["tini", "--"]
CMD ["bash"]
