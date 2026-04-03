#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  playwright-mcp container
# Playwright MCP server for agentic web browsing
# Default: SSE transport on port 3002
# Override MCP_TRANSPORT=stdio for docker exec usage
# ============================================================
echo "==> playwright-mcp container running (headless Chromium)" >&2
echo "    Transport: ${MCP_TRANSPORT:-sse}" >&2

if [ "${MCP_TRANSPORT}" = "stdio" ]; then
  # stdio mode — keep alive for docker exec access
  exec sleep infinity
else
  # SSE mode — HTTP server for remote agents
  exec npx @playwright/mcp@latest --headless --host 0.0.0.0 --port "${MCP_PORT:-3002}" --allowed-hosts '*' --caps vision
fi
