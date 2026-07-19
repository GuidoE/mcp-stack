# Postiz — social scheduling + MCP for Coco

Self-hosted [Postiz](https://postiz.com) on CT 106, deployed 2026-07-18 for
[coco-config#1](https://github.com/the-real-bojangles/coco-config/issues/1)
(Scout drafts → Postiz schedules → platforms publish).

## Layout

- **`/opt/postiz`** — clone of [gitroomhq/postiz-docker-compose](https://github.com/gitroomhq/postiz-docker-compose).
  The official `docker-compose.yaml` is **never edited**; all customization lives in
  `docker-compose.override.yaml` + `.env` (both in `.git/info/exclude`, so `git pull` stays clean).
- **`.env`** (chmod 600, root-only) — `JWT_SECRET`, `POSTIZ_PG_PASSWORD`, and the
  Phase-2 provider credentials (`FACEBOOK_APP_ID/SECRET`, `PINTEREST_CLIENT_ID/SECRET`,
  `TIKTOK_CLIENT_ID/SECRET`) referenced by the override via compose interpolation.
  Instagram publishes through the Meta (`FACEBOOK_*`) app — there are no separate IG keys.
- Separate stack on purpose: `scripts/update.sh` does **not** touch it.
  Update with `cd /opt/postiz && git pull && docker compose pull && docker compose up -d`.

## Services / ports

9 containers: postiz (app, nginx on :5000 in-container), postiz-postgres (17-alpine),
postiz-redis (7.2), temporal + temporal-postgresql (16) + temporal-elasticsearch (7.17)
+ temporal-ui + temporal-admin-tools, spotlight (debug profile only, not started).

| Endpoint | Where |
|---|---|
| Web UI / API | `http://192.168.11.6:3004` (LAN) / `http://100.88.111.96:3004` (Tailscale) |
| MCP (streamable HTTP) | `http://<host>:3004/api/mcp/<API_KEY>` — or `/api/mcp` with `Authorization: Bearer <API_KEY>` |
| Temporal UI (stuck schedules) | `127.0.0.1:8081` on CT 106 — `ssh -L 8081:localhost:8081 root@192.168.11.6` (host :8080 belongs to traefik) |
| Temporal gRPC | `127.0.0.1:7233` (internal) |

## Gotchas (learned during deploy)

- **Env changes need `docker compose down && docker compose up -d`** — `restart` does not
  re-read environment.
- **AppArmor**: every service needs `security_opt: ["apparmor=unconfined"]` in this LXC
  (same as the main mcp-stack compose) or containers fail to create.
- **`NOT_SECURED: "true"` is required** while serving plain http — without it the `auth`
  cookie is `Secure` and no login session survives (browser or curl).
- **Registration is disabled** (`DISABLE_REGISTRATION: "true"`). To add a user, flip it,
  `down && up`, register, flip back.
- Footprint measured at deploy: **~4.8 GiB RAM**, ~10 GiB disk for images+volumes.
  CT 106 was bumped 3→8 GiB RAM, 2→4 cores, 20→35 GiB disk for this (2026-07-18).
- Compose ≥ 2.24 required (`!override` tags in the override file). CT has v5.1.1.

## Credentials

Admin login + API key: 1Password → OpenClaw-Secrets → "Postiz admin (CT 106 mcp-stack)".
(Bootstrap copy at `/root/postiz-admin-creds.txt` on CT 106 until moved — delete after.)
The API key is embedded in Coco's `~/.hermes/config.yaml` `mcp_servers.postiz.url`
(CT 109, chmod 600). Rotate via UI → Settings → Public API, or `POST /api/user/api-key/rotate` —
rotating invalidates Coco's URL, update both places.

## Before platform OAuth (Phase 2)

Meta/TikTok OAuth redirect URIs require **https**. Front Postiz through the existing
traefik (`*.superg.co` Let's Encrypt) and switch `MAIN_URL`/`FRONTEND_URL`/
`NEXT_PUBLIC_BACKEND_URL` to the https hostname (then `down && up`, and drop `NOT_SECURED`)
before connecting Instagram/Facebook/TikTok/Pinterest.
