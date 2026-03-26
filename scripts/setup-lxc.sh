#!/usr/bin/env bash
# ============================================================
# setup-lxc.sh  —  Run on the PROXMOX HOST
# Creates LXC 106 (mcp-stack) as a privileged container
# Usage: bash scripts/setup-lxc.sh
# ============================================================
set -euo pipefail

CTID=106
HOSTNAME="mcp-stack"
TEMPLATE="local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst"
STORAGE="local-lvm"   # adjust to your Proxmox storage pool
DISK_SIZE="20"        # GB
MEMORY="3072"         # MB
CORES="2"
IP="192.168.11.6/24"  # VLAN 11 — homelab infra (USW Enterprise 24 PoE)
GATEWAY="192.168.11.1"

echo "==> Downloading Ubuntu 24.04 template (skip if already present)..."
pveam update
pveam download local ubuntu-24.04-standard_24.04-2_amd64.tar.zst || true

echo "==> Creating privileged LXC ${CTID} (${HOSTNAME})..."
pct create ${CTID} ${TEMPLATE} \
  --hostname ${HOSTNAME} \
  --storage ${STORAGE} \
  --rootfs ${STORAGE}:${DISK_SIZE} \
  --memory ${MEMORY} \
  --cores ${CORES} \
  --net0 name=eth0,bridge=vmbr0,ip=${IP},gw=${GATEWAY},tag=11 \
  --unprivileged 0 \
  --features nesting=1,keyctl=1 \
  --onboot 1 \
  --start 1

echo "==> Waiting for LXC to boot..."
sleep 5

echo "==> Copying bootstrap script into LXC..."
pct push ${CTID} ./scripts/bootstrap.sh /root/bootstrap.sh
pct exec ${CTID} -- chmod +x /root/bootstrap.sh

echo ""
echo "===================================================="
echo " LXC ${CTID} created and started."
echo " Next step — run bootstrap inside the container:"
echo "   pct exec ${CTID} -- bash /root/bootstrap.sh"
echo "===================================================="
