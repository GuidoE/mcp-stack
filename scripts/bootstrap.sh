#!/usr/bin/env bash
# ============================================================
# bootstrap.sh  —  Run INSIDE LXC 106 (mcp-stack)
# Installs: Docker, Docker Compose, Node.js LTS, Tailscale
# Usage: bash /root/bootstrap.sh
# ============================================================
set -euo pipefail

echo "==> Updating apt..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git ca-certificates gnupg lsb-release

# ---- Docker ------------------------------------------------
echo "==> Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
echo "==> Docker installed: $(docker --version)"

# ---- Node.js LTS -------------------------------------------
echo "==> Installing Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs
echo "==> Node.js installed: $(node --version)"

# ---- Tailscale ---------------------------------------------
echo "==> Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh
echo "==> Tailscale installed. Run 'tailscale up' to authenticate."

# ---- PnP CLI for Microsoft 365 (global) --------------------
echo "==> Installing PnP CLI for Microsoft 365..."
npm install -g @pnp/cli-microsoft365
echo "==> PnP CLI installed: $(m365 --version)"

# ---- PnP MCP server (global) -------------------------------
echo "==> Installing PnP CLI Microsoft 365 MCP server..."
npm install -g @pnp/cli-microsoft365-mcp-server

# ---- Configure PnP CLI for MCP use -------------------------
m365 cli config set --key prompt --value false
m365 cli config set --key output --value text
m365 cli config set --key helpMode --value full

echo ""
echo "===================================================="
echo " Bootstrap complete!"
echo " Next steps:"
echo "   1. tailscale up                  # authenticate Tailscale"
echo "   2. m365 login                    # authenticate to M365"
echo "   3. cd /opt/mcp-stack && docker compose up -d"
echo "===================================================="
