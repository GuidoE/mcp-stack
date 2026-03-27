# ============================================================
# services/spotify-mcp/Dockerfile
# Spotify MCP server (marcelmarais/spotify-mcp-server)
# Provides: playlist CRUD, playback control, search, queue mgmt
# Transport: stdio via SSH
# ============================================================

FROM node:20-slim

WORKDIR /app

# Install git for cloning
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone and build the Spotify MCP server
RUN git clone --depth 1 https://github.com/marcelmarais/spotify-mcp-server.git . \
 && npm install \
 && npm run build

# Config is bind-mounted from host at runtime
# /app/spotify-config.json -> services/spotify-mcp/config/spotify-config.json

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
