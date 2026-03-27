#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  spotify-mcp container
# The MCP server uses stdio transport — it's meant to be
# launched as a subprocess via SSH + docker exec.
# This container stays alive for config/auth management.
#
# Auth flow (one-time):
#   1. Create Spotify Developer App at developer.spotify.com
#   2. Run auth locally on Mac:
#      cd /tmp && git clone --depth 1 https://github.com/marcelmarais/spotify-mcp-server.git
#      cd spotify-mcp-server && npm install && npm run build
#      cp spotify-config.example.json spotify-config.json
#      # Edit spotify-config.json with your clientId + clientSecret
#      npm run auth
#   3. Copy tokens to LXC:
#      scp /tmp/spotify-mcp-server/spotify-config.json \
#        root@mcp-stack:/opt/mcp-stack/services/spotify-mcp/config/spotify-config.json
#   4. Rebuild: docker compose up -d --build spotify-mcp
#
# Claude Desktop / Claude Code connects via:
#   ssh root@mcp-stack "docker exec -i spotify-mcp node /app/build/index.js"
# ============================================================

echo "==> spotify-mcp container running"
echo "    Config: /app/spotify-config.json (bind-mounted)"

if [ ! -f /app/spotify-config.json ]; then
  echo "    WARNING: spotify-config.json not found!"
  echo "    Run the auth flow (see entrypoint.sh comments) and bind-mount the config."
else
  echo "    Config found — tokens will auto-refresh on use"
fi

echo "    MCP server is launched by Claude Desktop/Code as a stdio subprocess"

# Keep container alive
exec sleep infinity
