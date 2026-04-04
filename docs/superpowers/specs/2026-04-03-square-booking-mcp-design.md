# Square Booking MCP Server — Design Spec

## Problem

Bo (OpenClaw agent on `claw.bowfin-bellatrix.ts.net`) needs to book appointments at Square merchants on behalf of the user. Browser scraping fails because Square's aggressive Cloudflare configuration blocks headless browsers and FlareSolverr. Asking the user to provide credit card numbers in chat is a non-starter — the user already has a Square account.

## Solution

A new `square-mcp` service on the MCP stack: a Playwright-based MCP server that maintains a persistent logged-in Square session. Bo calls it over stdio via SSH, same as every other service on the stack.

The user authenticates once via SMS OTP. Session cookies persist in a Docker volume. Bo books freely until the session expires, then asks for a new code. Booking uses payment methods already saved on the user's Square account — no card numbers ever pass through the agent.

## Architecture

- **Container:** Single Docker service on `mcp-stack` (LXC 106, 192.168.11.6)
- **Base image:** `mcr.microsoft.com/playwright:v1.52.0-jammy` (Chromium included)
- **Runtime:** TypeScript MCP server (Node.js) + Playwright browser automation
- **Transport:** stdio via SSH (`docker exec -i square-mcp <mcp-binary>`)
- **Network:** `mcp-net` bridge (same as all other services)
- **Access:** Bo connects over Tailscale → SSH → docker exec

## MCP Tools

### `square_login`

Initiate or complete a login flow.

- **Input:** `{ phone?: string, email?: string, otp_code?: string }`
- **Output:** `{ status: "otp_sent" | "logged_in" | "failed", message: string }`
- **Flow:**
  1. First call (with `phone` or `email`): Playwright navigates to Square login, enters credentials. Square sends OTP to user's phone. Returns `"otp_sent"`.
  2. Second call (with `otp_code`): Playwright enters the OTP. On success, cookies are saved to the persistent volume. Returns `"logged_in"`.

### `square_search_times`

Find available appointment slots at a merchant.

- **Input:** `{ merchant: string, service?: string, date_range?: { start: string, end: string } }`
  - `merchant` can be a URL or a favorites nickname
- **Output:** `{ times: [{ datetime: string, service: string, provider?: string }] }`

### `square_book`

Book an appointment.

- **Input:** `{ merchant: string, service: string, datetime: string }`
  - `merchant` can be a URL or a favorites nickname
- **Output:** `{ status: "booked" | "failed", confirmation?: { id, datetime, service, merchant }, error?: string }`

### `square_list_bookings`

List upcoming bookings.

- **Input:** `{}`
- **Output:** `{ bookings: [{ id, datetime, service, merchant, status }] }`

### `square_cancel`

Cancel a booking.

- **Input:** `{ booking_id?: string, merchant?: string, datetime?: string }`
  - Either `booking_id` or `merchant` + `datetime` to identify the booking
- **Output:** `{ status: "cancelled" | "failed", message: string }`

### `square_favorites`

Manage saved merchant shortcuts.

- **Input:** `{ action: "list" | "add" | "remove", nickname?: string, url?: string, default_service?: string, notes?: string }`
- **Output:** `{ favorites: { [nickname]: { url, default_service?, notes? } } }`

## Favorites Config

File: `services/square-mcp/config/favorites.json` (bind-mounted, gitignored)

```json
{
  "barber": {
    "url": "https://squareup.com/appointments/book/xxx",
    "default_service": "Haircut",
    "notes": "Ask for Mike"
  }
}
```

Example config committed as `services/square-mcp/config/favorites.example.json`.

## Session Management

- **Storage:** Docker volume `square-session` holds the Playwright browser profile (cookies, localStorage, etc.)
- **Persistence:** Survives container restarts, image rebuilds, `docker compose down/up`
- **Validation:** Before any booking action, the server checks session validity by navigating to the account page. If expired, returns `"session_expired"` so Bo can initiate re-auth.
- **Re-auth:** Bo calls `square_login` again, user provides new OTP. Typically needed every few days/weeks.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Session expired | Returns `session_expired` status — Bo asks user for new OTP |
| Merchant page not found | Returns error with the URL that failed |
| No available times | Returns empty `times` array — Bo suggests alternative dates |
| Slot taken during booking | Returns `failed` with Square's error message |
| Payment issue | Returns `failed` with Square's error message |
| Cloudflare challenge | Returns error suggesting retry (should be rare with real browser profile) |

## Container Configuration

### Dockerfile

- Base: `mcr.microsoft.com/playwright:v1.52.0-jammy`
- Install MCP server dependencies
- Copy MCP server source
- Copy entrypoint

### Entrypoint

- Same pattern as other services: `sleep infinity`
- MCP binary invoked on demand via `docker exec`

### docker-compose.yml entry

```yaml
square-mcp:
  build:
    context: ./services/square-mcp
    dockerfile: Dockerfile
  container_name: square-mcp
  restart: unless-stopped
  networks:
    - mcp-net
  volumes:
    - square-session:/app/.browser-data
    - ./services/square-mcp/config/favorites.json:/app/favorites.json
  security_opt:
    - apparmor=unconfined
```

New volume: `square-session` added to the top-level `volumes:` block.

### .env.example

No secrets needed — auth is handled interactively via OTP, session persisted in the Docker volume. A comment block is added to `.env.example` for documentation.

## File Structure

```
services/square-mcp/
  Dockerfile
  entrypoint.sh
  package.json
  tsconfig.json
  src/
    server.ts                   — MCP server entry point
    tools/
      login.ts                  — square_login implementation
      search.ts                 — square_search_times
      book.ts                   — square_book
      bookings.ts               — square_list_bookings, square_cancel
      favorites.ts              — square_favorites
    browser/
      session.ts                — session management, cookie persistence
      navigation.ts             — page navigation, element interaction
  config/
    favorites.example.json      — example favorites (committed)
```

`favorites.json` is gitignored (contains merchant-specific URLs).
