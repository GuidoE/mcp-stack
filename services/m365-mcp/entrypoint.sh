#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  m365-mcp container
# The PnP MCP server uses stdio transport — it's meant to be
# launched as a subprocess, not run as a persistent service.
# This container stays alive for auth management only.
# Claude Desktop connects via: npx @pnp/cli-microsoft365-mcp-server
# or via SSH to the LXC where m365 CLI is installed globally.
# ============================================================

echo "==> m365-mcp auth container running"
echo "    M365 auth dir: ~/.local/share/m365"
echo "    Run: m365 login   (if not authenticated)"
echo "    MCP server is launched by Claude Desktop as a stdio subprocess"

# Keep container alive for auth management
exec sleep infinity
