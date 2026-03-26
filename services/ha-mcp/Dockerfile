# ============================================================
# services/ha-mcp/Dockerfile
# Home Assistant MCP server via uvx ha-mcp
# ============================================================

FROM python:3.12-slim

WORKDIR /app

RUN pip install uv --break-system-packages

# Install ha-mcp via uv tool install so it's available as a command
RUN uv tool install ha-mcp

ENV PATH="/root/.local/bin:$PATH"

EXPOSE 3000

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
