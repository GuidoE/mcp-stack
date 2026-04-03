# ============================================================
# services/playwright-mcp/Dockerfile
# Playwright MCP server — headless Chromium for agentic browsing
# Transport: SSE (HTTP) on port 3002, or stdio via docker exec
# ============================================================

FROM node:20-slim

WORKDIR /app

# Install @playwright/mcp
RUN npm init -y && npm install @playwright/mcp

# Install Chromium + system dependencies via Playwright
RUN npx playwright install --with-deps chromium

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3002

ENTRYPOINT ["/entrypoint.sh"]
