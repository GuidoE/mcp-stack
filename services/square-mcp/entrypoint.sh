#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  square-mcp container
# Square booking MCP server via Playwright + stdio
# Launched by Bo via SSH into mcp-stack:
#   ssh root@mcp-stack "docker exec -i square-mcp node dist/server.js"
#
# Auth flow:
#   1. Bo calls square_login tool with user's phone number
#   2. Square sends OTP to user's phone
#   3. User gives Bo the code, Bo calls square_login with otp_code
#   4. Session persists in /app/.browser-data Docker volume
# ============================================================
echo "==> square-mcp container running" >&2
echo "    Browser data: /app/.browser-data (persistent volume)" >&2
echo "    Favorites: /app/favorites.json (bind-mounted)" >&2

if [ ! -f /app/favorites.json ]; then
  echo "    No favorites.json — starting with empty favorites" >&2
  echo "{}" > /app/favorites.json
fi

echo "    MCP server is launched by Bo as a stdio subprocess" >&2

exec sleep infinity
