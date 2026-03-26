# ============================================================
# services/m365-mcp/Dockerfile
# Wraps PnP CLI for Microsoft 365 MCP server in HTTP/SSE mode
# ============================================================

FROM node:20-slim

WORKDIR /app

# Install PnP CLI for Microsoft 365 and its MCP server globally
RUN npm install -g @pnp/cli-microsoft365 @pnp/cli-microsoft365-mcp-server

# Configure PnP CLI for MCP usage (no interactive prompts)
RUN m365 cli config set --key prompt --value false \
 && m365 cli config set --key output --value text \
 && m365 cli config set --key helpMode --value full

EXPOSE 3000

# Health endpoint via a tiny wrapper (see entrypoint.sh)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
