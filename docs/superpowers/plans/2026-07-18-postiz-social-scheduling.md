# Postiz Self-Hosted Social Scheduling + Coco MCP Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy self-hosted Postiz on CT 106 and wire its MCP server into Coco's Hermes gateway so Scout can schedule social posts (IG/FB/Pinterest, TikTok optional) with an explicit in-chat approval gate.

**Architecture:** Postiz runs as its own Docker Compose stack at `/opt/postiz` on CT 106 (mcp-stack, 192.168.11.6, Tailscale 100.88.111.96), separate from the `/opt/mcp-stack` compose stack, exposed on host port **3004** following the mcp-stack port convention. Coco (CT 109, `hermes@10.0.0.4`) consumes Postiz via a new `mcp_servers:` entry in `~/.hermes/config.yaml` over Tailscale, same pattern as Jinx's playwright/square entries.

**Tech Stack:** Postiz (ghcr.io/gitroomhq/postiz-app), Postgres 17-alpine + Redis 7.2 + Temporal 1.28 + Elasticsearch 7.17 (Postiz's own stack), Docker Compose override file, Hermes gateway MCP client.

**Tracking issue:** the-real-bojangles/coco-config#1

## Global Constraints

- "Nothing ever publishes without her explicit in-chat approval of the exact content" — confirm-before-publish is a **hard rule** (issue AC #2).
- "No secrets in this repo or in any chat transcript" (issue AC #4). All credentials → 1Password (OpenClaw-Secrets).
- "Do not start until the shop owner has used Coco's manual workflow ~2–3 weeks" gates **Phase 2 platform connection only** — the issue's own risk section says "start Phase 0 first, build Phase 1 in parallel."
- "Only official platform APIs via Postiz; no unofficial/scraper MCPs on her real accounts, ever."
- Postiz env changes require `docker compose down && up -d`, **not** `restart` (env is baked at container create).
- Official compose repo stays pristine — all customization in `docker-compose.override.yaml` (survives upstream updates; issue says don't hand-copy files).
- CT 106 restart interrupts live MCP servers (Jinx's playwright/square, m365) for ~1–2 min; all have compose restart policies.
- `systemctl --user restart hermes-gateway` on CT 109 loses Coco's session state — **warn Guido first, never automatic**.

## Verified Facts (2026-07-18)

| Fact | Value | How verified |
|---|---|---|
| CT 106 address | 192.168.11.6 (VLAN 11), Tailscale 100.88.111.96 | ssh + Coco/Jinx config URLs |
| CT 106 allocation | 3072 MB RAM, 512 MB swap, 2 cores, 20 G disk (6.7 G free) | `pct config 106`, `df` |
| Proxmox headroom | 51 G RAM available, local-lvm thin 824 G free | `free -h`, `pvesm status` |
| CT 106 lxcfs | **broken** ("Transport endpoint is not connected") | `free`/`head /proc/meminfo` in CT |
| Host port 3004 | free (3001 m365, 3002 playwright, 3003 square, 5433 pg, 80/443/8080 traefik) | `docker ps`, `ss -tlnp` |
| Port 8080 | taken by traefik dashboard → **Temporal UI must not claim it** | `ss -tlnp` |
| Postiz compose services | postiz, postiz-postgres (pg17-alpine), postiz-redis (7.2), temporal + temporal-postgresql (pg16) + temporal-elasticsearch (ES 7.17) + temporal-ui + admin-tools, spotlight | fetched `docker-compose.yaml` from gitroomhq/postiz-docker-compose@main |
| MCP endpoint exists self-hosted | backend mounts `/mcp` (Bearer token) **and** `/mcp/:apikey` (key in path); auth via org API key or `pos_` OAuth token | read `libraries/nestjs-libraries/src/chat/start.mcp.ts` @main |
| Coco | CT 109 "coco", `hermes@10.0.0.4`, Tailscale 100.112.234.13, 8 G RAM (7.6 G avail), **no docker**, **no `mcp_servers:` block yet** | `pct config/exec 109` |
| Jinx (pattern reference) | CT 107 "hermes", `~/.hermes/config.yaml` has `mcp_servers:` with plain `url:` entries (`http://100.88.111.96:3002/mcp`, `:3003/mcp`) | read config on CT 107 |
| Hermes env substitution | no `expandvars`/interpolation found in config load path — **assume unsupported**, treat config.yaml as secret-bearing | grep on CT 109 hermes-agent |

## Phase → Task Map

| Issue phase | Tasks | Executable by |
|---|---|---|
| Phase 0 — accounts | Owner checklist (Task 8 posts it) | **Shop owner + Guido** (Meta App Review = long pole, start now) |
| Phase 1 — deploy | Tasks 1–4 | Claude, now |
| Phase 2 — connect platforms | Blocked on Phase 0 creds + conversion data | Owner clicks OAuth; Claude enters env creds |
| Phase 3 — MCP wiring | Tasks 5–6 (stage), gateway restart = Guido handoff | Claude stages; Guido triggers restart |
| Phase 4 — fleet docs | Task 7 (drafts, PR after Phase 3 lands) | Claude |
| Phase 5 — E2E verify | After Phases 2+3 | Guido + owner in WhatsApp |

---

### Task 1: Bump CT 106 resources

**Files:** none (Proxmox host operations)

**Interfaces:**
- Produces: CT 106 with 8 G RAM / 2 G swap / 4 cores / 35 G disk — capacity floor for Task 3.

- [ ] **Step 1: Apply memory/cpu (live, no restart)**

```bash
ssh proxmox 'pct set 106 -memory 8192 -swap 2048 -cores 4 && pct config 106 | grep -E "memory|swap|cores"'
```

Expected: `cores: 4`, `memory: 8192`, `swap: 2048`.

- [ ] **Step 2: Grow rootfs (live, thin-LVM)**

```bash
ssh proxmox 'pct resize 106 rootfs +15G'
ssh root@192.168.11.6 'df -h / | tail -1'
```

Expected: `/dev/mapper/pve-vm--106--disk--0  35G ... ~21G avail`.

### Task 2: Fix lxcfs (CT restart) and prove stack self-heals

**Files:** none

**Interfaces:**
- Produces: working `free -h` inside CT 106 (needed to measure Postiz footprint); evidence for issue AC #3 (stack survives reboot).

- [ ] **Step 1: Check lxcfs on the Proxmox host first**

```bash
ssh proxmox 'systemctl is-active lxcfs && systemctl status lxcfs --no-pager | head -5'
```

Expected: `active`. If not active, `systemctl restart lxcfs` before touching the CT; if it crash-loops, STOP and investigate before rebooting anything.

- [ ] **Step 2: Reboot CT 106 (brief MCP outage, ~1–2 min)**

```bash
ssh proxmox 'pct reboot 106'
sleep 45
ssh root@192.168.11.6 'free -h | head -2; docker ps --format "{{.Names}}\t{{.Status}}"'
```

Expected: `free` prints real numbers (~8.0Gi total); all containers `Up` (playwright-mcp, square-mcp, m365-mcp, mcp-postgres, traefik, flaresolverr if present, ha-mcp, spotify-mcp).

### Task 3: Deploy Postiz at /opt/postiz

**Files:**
- Create on CT 106: `/opt/postiz` (clone of gitroomhq/postiz-docker-compose)
- Create: `/opt/postiz/docker-compose.override.yaml`
- Create: `/opt/postiz/postiz.env` (chmod 600 — will hold provider secrets in Phase 2)

**Interfaces:**
- Consumes: capacity from Task 1.
- Produces: Postiz UI at `http://192.168.11.6:3004`, backend `/api` behind same port; `postiz.env` as the single place Phase-2 provider creds go.

- [ ] **Step 1: Clone official compose repo (do not fork/hand-copy)**

```bash
ssh root@192.168.11.6 'git clone https://github.com/gitroomhq/postiz-docker-compose.git /opt/postiz && cd /opt/postiz && git log -1 --format="%h %ad" --date=short'
```

- [ ] **Step 2: Check whether the image entrypoint reads /config/postiz.env**

```bash
curl -fsSL https://raw.githubusercontent.com/gitroomhq/postiz-app/main/Dockerfile.dev 2>/dev/null | grep -i -A2 config; \
curl -fsSL https://raw.githubusercontent.com/gitroomhq/postiz-app/main/var/docker/entrypoint.sh 2>/dev/null | grep -i -B2 -A4 "postiz.env\|/config"
```

If the entrypoint sources `/config/postiz.env` → mount `postiz.env` into the existing `postiz-config:/config` volume path. Otherwise → use compose-native `env_file:` in the override (functionally identical; env changes still need `down && up -d`). The override below assumes `env_file:`; adjust if /config wins.

- [ ] **Step 3: Write override file (official yaml stays pristine)**

`/opt/postiz/docker-compose.override.yaml`:

```yaml
services:
  postiz:
    ports: !override
      - "3004:4007"
    env_file:
      - ./postiz.env
    environment:
      MAIN_URL: "http://192.168.11.6:3004"
      FRONTEND_URL: "http://192.168.11.6:3004"
      NEXT_PUBLIC_BACKEND_URL: "http://192.168.11.6:3004/api"
      JWT_SECRET: "<generate: openssl rand -hex 32 — lives only on CT 106>"
      DISABLE_REGISTRATION: "false"   # flips to true in Task 4
    restart: always
  temporal-ui:
    ports: !override
      - "127.0.0.1:8081:8080"   # traefik owns :8080 on this host; Temporal UI debug via ssh -L only
  spotlight:
    profiles: ["debug"]          # Sentry dev tool — don't run in prod
```

Sanity-check merged config before up: `docker compose config | grep -A3 "ports:"` — 3004:4007 present, no 8080 host bind, no 4007 host bind.

- [ ] **Step 4: Start and watch it come up**

```bash
cd /opt/postiz && docker compose up -d && sleep 60 && docker compose ps
curl -s -o /dev/null -w "%{http_code}" http://192.168.11.6:3004
```

Expected: all services running/healthy (temporal-elasticsearch takes the longest); final curl `200`.

- [ ] **Step 5: Measure the footprint (informs whether 8 G holds)**

```bash
ssh root@192.168.11.6 'free -h | head -2; docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}"'
```

Record numbers in the deploy notes. If available RAM < 1 G, bump CT to 10–12 G (host has 51 G free).

### Task 4: Admin user + lock registration + creds to 1Password

**Interfaces:**
- Produces: admin login in 1Password (OpenClaw-Secrets), registration closed, Postiz API key for Task 5.

- [ ] **Step 1: Register the admin via the API** (email `guido@espinosahome.com`, password from `openssl rand -base64 24`, never echoed to chat/transcript)
- [ ] **Step 2: Store credentials in 1Password** — `op item create --vault OpenClaw-Secrets --category login --title "Postiz admin (CT 106)"` if `op` is signed in; fallback: `/root/postiz-admin-creds.txt` chmod 600 on CT 106 + explicit handoff note to Guido to move it into 1Password and delete.
- [ ] **Step 3: Flip `DISABLE_REGISTRATION: "true"` in the override, then `docker compose down && docker compose up -d`** (not `restart` — env gotcha). Verify signup page rejects new registration.

### Task 5: Verify self-hosted MCP endpoint + get API key

**Interfaces:**
- Produces: the exact working MCP URL for Coco's config.

- [ ] **Step 1: Discriminator curl without auth** — `curl -si http://192.168.11.6:3004/api/mcp | head -1` and same for `/mcp`. Expected: exactly one returns `401 Missing Authorization header` (that's the mount); `404` means wrong prefix.
- [ ] **Step 2: Get API key** — UI: Settings → Developers → Public API (or `POST /api/auth/login` → JWT → the developer-settings endpoint). Key goes to 1Password alongside admin creds.
- [ ] **Step 3: Full MCP handshake with key in path** (matches Hermes plain-URL pattern): `curl -s -X POST http://192.168.11.6:3004/<verified-prefix>/mcp/<API_KEY> -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'` — expect an `initialize` result naming `Postiz MCP`.
- [ ] **Step 4: Repeat over Tailscale from CT 109** (`curl` from Coco's box against `100.88.111.96:3004`) — proves the actual path Coco will use.

### Task 6: Stage Coco's config (NO gateway restart)

**Files:**
- Modify (staged, not applied): `/home/hermes/.hermes/config.yaml` on CT 109

**Interfaces:**
- Consumes: verified MCP URL from Task 5.
- Produces: ready-to-apply `mcp_servers:` block + one-command handoff for Guido.

- [ ] **Step 1: Confirm Hermes MCP client config schema** — read how Jinx's entries are consumed (`agent/` source on CT 109); check if `headers:` is supported for Bearer auth. If yes → `/mcp` + header, key could go in an env the gateway reads. If no (expected) → key-in-URL `http://100.88.111.96:3004/<prefix>/mcp/<API_KEY>`.
- [ ] **Step 2: If key-in-URL: `chmod 600 /home/hermes/.hermes/config.yaml`** and flag: config.yaml is now secret-bearing → coco-config repo snapshot flow must redact/exclude it (issue's STOP condition — resolve before any push of config).
- [ ] **Step 3: Write the block into config.yaml** (safe pre-restart; gateway reads at startup):

```yaml
mcp_servers:
  postiz:
    url: http://100.88.111.96:3004/<verified-prefix>/mcp/<API_KEY>
```

- [ ] **Step 4: Handoff to Guido — do not run:** `ssh hermes@10.0.0.4 'systemctl --user restart hermes-gateway'` (Coco loses session state; run when convenient), then confirm tools: `hermes mcp` / tool listing shows Postiz tools.

### Task 7: Docs — mcp-stack notes + coco-config drafts

- [ ] **Step 1: mcp-stack README** — add postiz :3004 to architecture diagram + services table; note `/opt/postiz` is a separate compose stack (update via `git pull` there, not scripts/update.sh); note Temporal UI on localhost:8081 via SSH tunnel for stuck-schedule debugging.
- [ ] **Step 2: Deploy notes** — `docs/postiz.md` in mcp-stack: override-file approach, env-change gotcha (`down && up`), measured RAM footprint, admin-creds location, MCP URL shape (redacted).
- [ ] **Step 3: coco-config drafts (Phase 4 — PR only after Phase 3 lands):** `agents/scout.md` (may schedule via Postiz tools; ALWAYS show owner final caption + image + time and get explicit "yes" in chat before scheduling; never bulk-schedule >1 week ahead without asking; edits/deletions of published posts stay manual), `AGENTS.md` (routing + hard stop: posting costs reputation, confirm-before-publish), `docs/handoff-for-the-boss.md` ("Coco can now schedule the post for you — she'll always show you exactly what goes out and when, and asks first"). Secret-free check before any push.

### Task 8: Report back on issue #1

- [ ] **Step 1: Comment on coco-config#1** (as the-real-bojangles): verified facts + resolved open questions, what's deployed, measured footprint, Phase 0 owner checklist (IG→Business, FB Page + link IG, Meta dev app + App Review for `pages_manage_posts`/`instagram_content_publish` — the long pole, start now; TikTok audit = explicitly optional; Pinterest business account), what's staged awaiting the gateway restart, remaining human gates. No secrets.

---

## Self-Review Notes

- Phase 2 (enter provider creds into `postiz.env`, owner OAuth-connects, test post per platform) intentionally has no task here — blocked on Phase 0 outputs and the 2–3-week conversion data gate. `postiz.env` + `down && up` procedure from Task 3 is its landing zone.
- Phase 5 (WhatsApp E2E incl. rejected-draft-not-scheduled test) requires Phases 2+3 live — belongs to a follow-up session with Guido + owner.
- TikTok stays manual unless Guido decides the audit is worth it (issue explicitly allows this).
- Rollback: `cd /opt/postiz && docker compose down` removes the whole stack; volumes persist; CT resource bump is reversible via `pct set`.
