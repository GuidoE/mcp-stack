#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  m365-mcp container startup
# Starts the PnP MCP server with HTTP/SSE transport
# ============================================================
set -e

echo "==> Starting PnP CLI for Microsoft 365 MCP server..."
echo "    M365 auth dir: ~/.local/share/m365"

# The PnP MCP server reads from the global m365 CLI auth store.
# The volume mount in docker-compose.yml persists auth across restarts.
# Run: docker exec -it m365-mcp m365 login   (first time only)

exec node /usr/local/lib/node_modules/@pnp/cli-microsoft365-mcp-server/dist/index.js
