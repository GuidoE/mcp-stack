#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  square-mcp container
# Square booking MCP server via Playwright
# Default: SSE transport on port 3003 (for Bo on OpenClaw)
# Override MCP_TRANSPORT=stdio for docker exec usage
#
# Auth flow:
#   1. Bo calls square_login tool with user's phone number
#   2. Square sends OTP to user's phone
#   3. User gives Bo the code, Bo calls square_login with otp_code
#   4. Session persists in /app/.browser-data Docker volume
# ============================================================
echo "==> square-mcp container running" >&2
echo "    Transport: ${MCP_TRANSPORT:-sse}" >&2
echo "    Browser data: /app/.browser-data (persistent volume)" >&2
echo "    Favorites: /app/favorites.json (bind-mounted)" >&2

if [ ! -f /app/favorites.json ]; then
  echo "    No favorites.json — starting with empty favorites" >&2
  echo "{}" > /app/favorites.json
fi

if [ "${MCP_TRANSPORT}" = "stdio" ]; then
  echo "    MCP server available via: docker exec -i square-mcp node dist/server.js" >&2
  exec sleep infinity
else
  echo "    SSE endpoint: http://0.0.0.0:${MCP_PORT:-3003}/sse" >&2
  exec node dist/server.js
fi
