#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  ha-mcp container
# Home Assistant MCP server via stdio
# Launched by Claude Desktop/Code via SSH into mcp-stack
# ============================================================
echo "==> ha-mcp container running" >&2
echo "    HA URL: $HOMEASSISTANT_URL" >&2
exec sleep infinity
