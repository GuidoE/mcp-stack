# Massive.com MCP server (massive-com/mcp_massive v0.10.0) over streamable HTTP.
# mcp<2 is required: v0.10.0 imports mcp.server.fastmcp, which mcp 2.x renamed.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir "mcp<2" \
    "mcp_massive @ git+https://github.com/massive-com/mcp_massive@c58ec7e4df7482c53fc4adeb2de0e979f77f3a23" \
 && useradd -r -u 10001 -s /usr/sbin/nologin mcp
COPY entrypoint.sh /usr/local/bin/massive-mcp-entrypoint
RUN chmod 0555 /usr/local/bin/massive-mcp-entrypoint
USER 10001
ENTRYPOINT ["/usr/local/bin/massive-mcp-entrypoint"]
