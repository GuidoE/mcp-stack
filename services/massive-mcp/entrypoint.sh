#!/bin/sh
# The key comes from a file secret; it is never logged or passed on the command line.
# mcp_massive builds FastMCP with the default host 127.0.0.1 (FASTMCP_HOST is ignored because the
# constructor passes host explicitly), so set it on the instance before starting. Only massive-mcp-auth
# on mcp-net can reach this port; it sends Host: localhost, which FastMCP's rebinding guard accepts.
set -eu
[ -r /run/secrets/massive_api_key ] || { echo "massive-mcp: secret /run/secrets/massive_api_key missing" >&2; exit 78; }
MASSIVE_API_KEY=$(cat /run/secrets/massive_api_key)
export MASSIVE_API_KEY
exec python -c '
import sys
from mcp_massive import server, main
server.mass_mcp.settings.host = "0.0.0.0"
server.mass_mcp.settings.port = 8000
sys.argv = ["mcp_massive", "--transport", "streamable-http"]
main()
'
