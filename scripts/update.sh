#!/usr/bin/env bash
# ============================================================
# scripts/update.sh  —  Pull latest and restart changed services
# Run inside LXC 106 from /opt/mcp-stack
# ============================================================
set -euo pipefail

echo "==> Pulling latest from git..."
git pull origin main

echo "==> Rebuilding and restarting changed containers..."
docker compose pull
docker compose up -d --build

echo "==> Stack status:"
docker compose ps
