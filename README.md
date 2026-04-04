# mcp-stack

Infrastructure-as-code for all MCP servers. Runs as a Docker Compose stack on a privileged Ubuntu 24.04 LXC (CTID 106) on Proxmox. Accessible from any device via Tailscale.

---

## Network topology

```
UDM-Pro (192.168.1.1)
├── VLAN 1   192.168.1.0/24    Management (UniFi infra only)
├── VLAN 2   192.168.2.0/24    Trusted LAN (Macs, Proxmox, trading)
├── VLAN 3   192.168.3.0/24    Kids network
├── VLAN 4   192.168.4.0/24    IoT / untrusted
├── VLAN 10  192.168.10.0/27   Guest
├── VLAN 666 10.0.0.0/29       OpenClaw (isolated)
└── VLAN 4040 10.255.253.0/24  Inter-network routing

USW Enterprise 24 PoE (10.255.253.2) — L3 switch
├── VLAN 2   192.168.2.0/24    Trusted LAN (Proxmox hypervisor here)
├── VLAN 5   192.168.5.0/24    Protect infra (cameras, NVR)
└── VLAN 11  192.168.11.0/24   Homelab infra ← mcp-stack lives here
```

**LXC 106 (mcp-stack):** `192.168.11.6`, gateway `192.168.11.1`, VLAN tag 11

---

## Architecture

```
USW Enterprise 24 PoE — VLAN 11 (192.168.11.0/24)
└── LXC 106 — mcp-stack (privileged Ubuntu 24.04, 192.168.11.6)
    └── Docker Compose
        ├── m365-mcp      (PnP CLI for Microsoft 365, port 3001)
        ├── playwright-mcp (headless Chromium browser, SSE on port 3002)
        ├── flaresolverr  (Cloudflare anti-bot bypass, port 8191)
        ├── square-mcp    (Square appointment booking, SSE on port 3003)
        ├── postgres      (shared PostgreSQL 17, port 5433)
        ├── traefik       (reverse proxy, port 80 / dashboard 8080)
        └── [future MCPs] (add as new services)
```

Claude Desktop on Mac Studio / MaxBlack reaches mcp-stack over Tailscale
or directly via VLAN 2 → VLAN 11 inter-VLAN routing on the USW Enterprise.

---

## Prerequisites — before running setup-lxc.sh

### 1. Create VLAN 11 on USW Enterprise 24 PoE

In UniFi Network console:
- Networks → Create New Network
- Name: `Homelab Infra`, VLAN ID: `11`, Subnet: `192.168.11.0/24`
- Gateway IP: `192.168.11.1` (on the switch)
- Enable DHCP if desired (LXC uses static IP so not required)

### 2. Tag VLAN 11 on the Proxmox port

In UniFi Network console:
- Ports → find the port Proxmox is connected to
- Set port profile to trunk, add VLAN 11 to the allowed VLANs

### 3. Add static route on UDM-Pro

In UniFi Network console (or SSH):
- Settings → Routing → Static Routes
- Destination: `192.168.11.0/24`, Next hop: `10.255.253.2`
- (Mirrors the existing VLAN 5 route pattern)

### 4. Add firewall rule — VLAN 2 → VLAN 11

Allow your Macs to reach the MCP services:
- Source: `192.168.2.0/24`
- Destination: `192.168.11.0/24`
- Ports: `3001` (m365-mcp), `3002` (playwright-mcp), `5433` (postgres), `80` (Traefik), `8080` (Traefik dashboard)
- Action: Allow

---

## First-time setup

### 1. Create the LXC on Proxmox

Run on the **Proxmox host**:

```bash
bash scripts/setup-lxc.sh
```

### 2. Bootstrap the LXC

Run inside the **LXC**:

```bash
bash /root/bootstrap.sh
```

Installs Docker, Node.js LTS, Tailscale, and the PnP CLI + MCP server.

### 3. Connect Tailscale

```bash
tailscale up
```

### 4. Deploy the stack

```bash
git clone https://github.com/GuidoE/mcp-stack.git /opt/mcp-stack
cd /opt/mcp-stack
cp .env.example .env
docker compose up -d
```

### 5. Authenticate to Microsoft 365 (one-time)

```bash
docker exec -it m365-mcp m365 login
```

Follow the device code flow. Auth is persisted in a Docker volume.

---

## Connecting Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "m365": {
      "command": "npx",
      "args": ["-y", "@pnp/cli-microsoft365-mcp-server"],
      "transport": "stdio"
    }
  }
}
```

> For HTTP/SSE transport via Docker, use the Tailscale hostname:
> `http://mcp-stack:3001/sse`

---

## Updating the stack

```bash
cd /opt/mcp-stack && bash scripts/update.sh
```

---

## Adding a new MCP service

1. Create `services/<name>/Dockerfile` and `entrypoint.sh`
2. Add a new service block to `docker-compose.yml`
3. Run `docker compose up -d --build`

---

## Services

| Service        | Port | Description                              |
|----------------|------|------------------------------------------|
| m365-mcp       | 3001 | PnP CLI for Microsoft 365                |
| playwright-mcp | 3002 | Headless Chromium for agentic browsing    |
| square-mcp     | 3003 | Square appointment booking               |
| postgres       | 5433 | Shared PostgreSQL 17                     |
| flaresolverr   | 8191 | Cloudflare anti-bot bypass proxy         |
| traefik        | 80   | Reverse proxy                            |
| traefik        | 8080 | Dashboard (disable in production)        |
