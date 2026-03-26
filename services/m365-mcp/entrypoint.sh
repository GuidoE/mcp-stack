#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  m365-mcp container startup
# ============================================================
set -e

echo "==> Starting PnP CLI for Microsoft 365 MCP server..."
echo "    M365 auth dir: ~/.local/share/m365"

# Find the correct entry point for the MCP server
MCP_BIN=$(find /usr/local/lib/node_modules/@pnp/cli-microsoft365-mcp-server -name "*.js" | grep -i "index\|server\|main\|start" | head -1)

if [ -z "$MCP_BIN" ]; then
  echo "ERROR: Could not find MCP server entry point. Listing package contents:"
  ls -la /usr/local/lib/node_modules/@pnp/cli-microsoft365-mcp-server/
  # Keep container alive for inspection
  sleep infinity
fi

echo "==> Found MCP server at: $MCP_BIN"
exec node "$MCP_BIN"
