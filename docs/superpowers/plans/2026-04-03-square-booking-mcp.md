# Square Booking MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that lets Bo book Square appointments using a persistent browser session authenticated via SMS OTP.

**Architecture:** TypeScript MCP server running Playwright in a Docker container on the mcp-stack. Persistent browser context stored in a Docker volume preserves login sessions across restarts. Bo invokes tools over stdio via `docker exec`.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Playwright, vitest, Docker

**Spec:** `docs/superpowers/specs/2026-04-03-square-booking-mcp-design.md`

---

## File Map

```
services/square-mcp/
  Dockerfile                    — Playwright base image + npm build
  entrypoint.sh                 — sleep infinity (MCP launched via docker exec)
  package.json                  — dependencies + build/test scripts
  tsconfig.json                 — TypeScript config
  src/
    server.ts                   — MCP server entry, tool registration, stdio transport
    tools/
      login.ts                  — square_login: OTP auth flow
      search.ts                 — square_search_times: find available slots
      book.ts                   — square_book: complete a booking
      bookings.ts               — square_list_bookings + square_cancel
      favorites.ts              — square_favorites: manage saved merchants
    browser/
      session.ts                — persistent browser context, session validation
      navigation.ts             — merchant URL resolution, common page helpers
  tests/
    favorites.test.ts           — unit tests for favorites CRUD
    navigation.test.ts          — unit tests for URL resolution
  config/
    favorites.example.json      — example favorites (committed to git)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `services/square-mcp/package.json`
- Create: `services/square-mcp/tsconfig.json`
- Create: `services/square-mcp/Dockerfile`
- Create: `services/square-mcp/entrypoint.sh`
- Create: `services/square-mcp/config/favorites.example.json`
- Modify: `docker-compose.yml:69-97` (add square-mcp service + volume)
- Modify: `.env.example` (add comment block)
- Modify: `.gitignore` (add favorites.json)

- [ ] **Step 1: Create `services/square-mcp/package.json`**

```json
{
  "name": "square-mcp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "playwright": "^1.52.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create `services/square-mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `services/square-mcp/Dockerfile`**

```dockerfile
# ============================================================
# services/square-mcp/Dockerfile
# Square booking MCP server — Playwright + TypeScript
# Transport: stdio via SSH
# ============================================================

FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 4: Create `services/square-mcp/entrypoint.sh`**

```bash
#!/usr/bin/env sh
# ============================================================
# entrypoint.sh  —  square-mcp container
# Square booking MCP server via Playwright + stdio
# Launched by Bo via SSH into mcp-stack:
#   ssh root@mcp-stack "docker exec -i square-mcp node dist/server.js"
#
# Auth flow:
#   1. Bo calls square_login tool with user's phone number
#   2. Square sends OTP to user's phone
#   3. User gives Bo the code, Bo calls square_login with otp_code
#   4. Session persists in /app/.browser-data Docker volume
# ============================================================
echo "==> square-mcp container running" >&2
echo "    Browser data: /app/.browser-data (persistent volume)" >&2
echo "    Favorites: /app/favorites.json (bind-mounted)" >&2

if [ ! -f /app/favorites.json ]; then
  echo "    No favorites.json — starting with empty favorites" >&2
  echo "{}" > /app/favorites.json
fi

echo "    MCP server is launched by Bo as a stdio subprocess" >&2

exec sleep infinity
```

- [ ] **Step 5: Create `services/square-mcp/config/favorites.example.json`**

```json
{
  "barber": {
    "url": "https://squareup.com/appointments/book/MERCHANT_ID/LOCATION_ID/services",
    "default_service": "Haircut",
    "notes": "Ask for Mike"
  }
}
```

- [ ] **Step 6: Add square-mcp service to `docker-compose.yml`**

Insert after the flaresolverr service block (before traefik):

```yaml
  # ----------------------------------------------------------
  # square-mcp  —  Square appointment booking via Playwright
  # Transport: stdio via SSH
  # ----------------------------------------------------------
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

Add to the top-level `volumes:` block:

```yaml
  square-session:
```

- [ ] **Step 7: Update `.env.example`**

Add after the m365-mcp section:

```bash
# ---- square-mcp -----------------------------------------------
# No secrets — auth handled interactively via SMS OTP.
# Session persisted in square-session Docker volume.
# Favorites config: services/square-mcp/config/favorites.json
```

- [ ] **Step 8: Update `.gitignore`**

Add:

```
services/square-mcp/config/favorites.json
```

- [ ] **Step 9: Commit**

```bash
git add services/square-mcp/package.json services/square-mcp/tsconfig.json \
  services/square-mcp/Dockerfile services/square-mcp/entrypoint.sh \
  services/square-mcp/config/favorites.example.json \
  docker-compose.yml .env.example .gitignore
git commit -m "feat(square-mcp): scaffold project, Dockerfile, docker-compose entry"
```

---

### Task 2: Favorites Module (TDD)

**Files:**
- Create: `services/square-mcp/src/tools/favorites.ts`
- Create: `services/square-mcp/tests/favorites.test.ts`

- [ ] **Step 1: Write failing tests for favorites CRUD**

Create `services/square-mcp/tests/favorites.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import {
  loadFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  resolveMerchant,
  type Favorite,
} from "../src/tools/favorites.js";

const TEST_PATH = "/tmp/test-favorites.json";

beforeEach(() => {
  writeFileSync(TEST_PATH, JSON.stringify({
    barber: {
      url: "https://squareup.com/appointments/book/abc123/loc1/services",
      default_service: "Haircut",
      notes: "Ask for Mike",
    },
  }));
});

afterEach(() => {
  try { unlinkSync(TEST_PATH); } catch {}
});

describe("loadFavorites", () => {
  it("reads favorites from JSON file", () => {
    const favs = loadFavorites(TEST_PATH);
    expect(favs.barber).toBeDefined();
    expect(favs.barber.url).toContain("abc123");
  });

  it("returns empty object for missing file", () => {
    const favs = loadFavorites("/tmp/nonexistent.json");
    expect(favs).toEqual({});
  });
});

describe("addFavorite", () => {
  it("adds a new favorite and saves", () => {
    const favs = loadFavorites(TEST_PATH);
    const updated = addFavorite(favs, "dentist", {
      url: "https://squareup.com/appointments/book/xyz",
      default_service: "Cleaning",
    });
    saveFavorites(TEST_PATH, updated);

    const reloaded = loadFavorites(TEST_PATH);
    expect(reloaded.dentist.url).toContain("xyz");
    expect(reloaded.barber).toBeDefined();
  });
});

describe("removeFavorite", () => {
  it("removes an existing favorite", () => {
    const favs = loadFavorites(TEST_PATH);
    const updated = removeFavorite(favs, "barber");
    expect(updated.barber).toBeUndefined();
  });

  it("is a no-op for nonexistent nickname", () => {
    const favs = loadFavorites(TEST_PATH);
    const updated = removeFavorite(favs, "nope");
    expect(Object.keys(updated)).toEqual(["barber"]);
  });
});

describe("resolveMerchant", () => {
  it("resolves a nickname to a URL", () => {
    const favs = loadFavorites(TEST_PATH);
    const url = resolveMerchant(favs, "barber");
    expect(url).toContain("abc123");
  });

  it("returns input if it looks like a URL", () => {
    const favs = loadFavorites(TEST_PATH);
    const url = resolveMerchant(favs, "https://squareup.com/appointments/book/new");
    expect(url).toBe("https://squareup.com/appointments/book/new");
  });

  it("throws for unknown nickname", () => {
    const favs = loadFavorites(TEST_PATH);
    expect(() => resolveMerchant(favs, "nope")).toThrow("Unknown merchant");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/square-mcp && npm install && npx vitest run`
Expected: FAIL — module `../src/tools/favorites.js` not found

- [ ] **Step 3: Implement favorites module**

Create `services/square-mcp/src/tools/favorites.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";

export interface Favorite {
  url: string;
  default_service?: string;
  notes?: string;
}

export type Favorites = Record<string, Favorite>;

export function loadFavorites(path: string): Favorites {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveFavorites(path: string, favorites: Favorites): void {
  writeFileSync(path, JSON.stringify(favorites, null, 2));
}

export function addFavorite(
  favorites: Favorites,
  nickname: string,
  fav: Favorite,
): Favorites {
  return { ...favorites, [nickname]: fav };
}

export function removeFavorite(
  favorites: Favorites,
  nickname: string,
): Favorites {
  const { [nickname]: _, ...rest } = favorites;
  return rest;
}

export function resolveMerchant(favorites: Favorites, merchant: string): string {
  if (merchant.startsWith("http://") || merchant.startsWith("https://")) {
    return merchant;
  }
  const fav = favorites[merchant];
  if (!fav) throw new Error(`Unknown merchant: "${merchant}"`);
  return fav.url;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/square-mcp && npx vitest run`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/square-mcp/src/tools/favorites.ts services/square-mcp/tests/favorites.test.ts
git commit -m "feat(square-mcp): favorites module with CRUD and merchant resolution"
```

---

### Task 3: Browser Session Module

**Files:**
- Create: `services/square-mcp/src/browser/session.ts`

- [ ] **Step 1: Implement browser session manager**

Create `services/square-mcp/src/browser/session.ts`:

```typescript
import { chromium, type BrowserContext, type Page } from "playwright";

const BROWSER_DATA_DIR = process.env.BROWSER_DATA_DIR ?? "/app/.browser-data";
const SQUARE_ACCOUNT_URL = "https://squareup.com/appointments/buyer/dashboard";
const SQUARE_LOGIN_URL = "https://squareup.com/login";

let context: BrowserContext | null = null;
let page: Page | null = null;

export async function getBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  if (context && page && !page.isClosed()) {
    return { context, page };
  }

  context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function checkSession(): Promise<boolean> {
  const { page } = await getBrowser();
  try {
    await page.goto(SQUARE_ACCOUNT_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    const url = page.url();
    // If we weren't redirected to login, session is valid
    return !url.includes("/login");
  } catch {
    return false;
  }
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
    page = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/square-mcp/src/browser/session.ts
git commit -m "feat(square-mcp): browser session manager with persistent context"
```

---

### Task 4: Navigation Helpers

**Files:**
- Create: `services/square-mcp/src/browser/navigation.ts`
- Create: `services/square-mcp/tests/navigation.test.ts`

- [ ] **Step 1: Write failing test for URL resolution helper**

Create `services/square-mcp/tests/navigation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeBookingUrl } from "../src/browser/navigation.js";

describe("normalizeBookingUrl", () => {
  it("passes through full Square URLs", () => {
    const url = "https://squareup.com/appointments/book/abc123/loc1/services";
    expect(normalizeBookingUrl(url)).toBe(url);
  });

  it("passes through custom domain URLs", () => {
    const url = "https://booking.mybusiness.com/appointments";
    expect(normalizeBookingUrl(url)).toBe(url);
  });

  it("prepends https:// if missing", () => {
    expect(normalizeBookingUrl("squareup.com/appointments/book/abc"))
      .toBe("https://squareup.com/appointments/book/abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/square-mcp && npx vitest run tests/navigation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement navigation helpers**

Create `services/square-mcp/src/browser/navigation.ts`:

```typescript
import type { Page } from "playwright";

export function normalizeBookingUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  // Give dynamic content a moment to render
  await page.waitForTimeout(1500);
}

export async function getPageError(page: Page): Promise<string | null> {
  // Check for common error states
  const notFound = await page.locator("text=Page not found").count();
  if (notFound > 0) return "Page not found";

  const blocked = await page.locator("text=Access denied").count();
  if (blocked > 0) return "Access denied — possible Cloudflare block";

  return null;
}

export async function extractTextContent(
  page: Page,
  selector: string,
): Promise<string[]> {
  const elements = page.locator(selector);
  const count = await elements.count();
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await elements.nth(i).textContent();
    if (text) results.push(text.trim());
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/square-mcp && npx vitest run tests/navigation.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/square-mcp/src/browser/navigation.ts services/square-mcp/tests/navigation.test.ts
git commit -m "feat(square-mcp): navigation helpers with URL normalization"
```

---

### Task 5: MCP Server Entry Point + Favorites Tool

**Files:**
- Create: `services/square-mcp/src/server.ts`

- [ ] **Step 1: Implement MCP server with favorites tool wired up**

Create `services/square-mcp/src/server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadFavorites, saveFavorites, addFavorite, removeFavorite } from "./tools/favorites.js";
import { registerLoginTool } from "./tools/login.js";
import { registerSearchTool } from "./tools/search.js";
import { registerBookTool } from "./tools/book.js";
import { registerBookingsTool, registerCancelTool } from "./tools/bookings.js";
import { closeBrowser } from "./browser/session.js";

const FAVORITES_PATH = process.env.FAVORITES_PATH ?? "/app/favorites.json";

const server = new McpServer({
  name: "square-mcp",
  version: "1.0.0",
});

// ---- square_favorites ----
server.tool(
  "square_favorites",
  "List, add, or remove saved merchant shortcuts",
  {
    action: z.enum(["list", "add", "remove"]).describe("Action to perform"),
    nickname: z.string().optional().describe("Short name for the merchant"),
    url: z.string().optional().describe("Square booking page URL"),
    default_service: z.string().optional().describe("Default service to book"),
    notes: z.string().optional().describe("Notes about this merchant"),
  },
  async ({ action, nickname, url, default_service, notes }) => {
    let favorites = loadFavorites(FAVORITES_PATH);

    if (action === "add") {
      if (!nickname || !url) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "nickname and url required for add" }) }] };
      }
      favorites = addFavorite(favorites, nickname, { url, default_service, notes });
      saveFavorites(FAVORITES_PATH, favorites);
    }

    if (action === "remove") {
      if (!nickname) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "nickname required for remove" }) }] };
      }
      favorites = removeFavorite(favorites, nickname);
      saveFavorites(FAVORITES_PATH, favorites);
    }

    return { content: [{ type: "text", text: JSON.stringify({ favorites }) }] };
  },
);

// ---- Register browser-based tools ----
registerLoginTool(server);
registerSearchTool(server, FAVORITES_PATH);
registerBookTool(server, FAVORITES_PATH);
registerBookingsTool(server);
registerCancelTool(server);

// ---- Stdio transport ----
const transport = new StdioServerTransport();

process.on("SIGINT", async () => {
  await closeBrowser();
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  await server.close();
  process.exit(0);
});

await server.connect(transport);
```

Note: This file references `login.ts`, `search.ts`, `book.ts`, and `bookings.ts` which will be created in subsequent tasks. The TypeScript build will fail until those exist. Create placeholder files so the project compiles:

```bash
mkdir -p services/square-mcp/src/tools services/square-mcp/src/browser
```

Create temporary stubs for each tool file so TypeScript compiles. These will be replaced in Tasks 6-8.

`services/square-mcp/src/tools/login.ts`:
```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export function registerLoginTool(server: McpServer): void {
  // Implemented in Task 6
}
```

`services/square-mcp/src/tools/search.ts`:
```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export function registerSearchTool(server: McpServer, favoritesPath: string): void {
  // Implemented in Task 7
}
```

`services/square-mcp/src/tools/book.ts`:
```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export function registerBookTool(server: McpServer, favoritesPath: string): void {
  // Implemented in Task 7
}
```

`services/square-mcp/src/tools/bookings.ts`:
```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export function registerBookingsTool(server: McpServer): void {
  // Implemented in Task 8
}
export function registerCancelTool(server: McpServer): void {
  // Implemented in Task 8
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd services/square-mcp && npm run build`
Expected: Compiles with no errors. `dist/` directory created.

- [ ] **Step 3: Commit**

```bash
git add services/square-mcp/src/
git commit -m "feat(square-mcp): MCP server entry point with favorites tool"
```

---

### Task 6: Login Tool

**Files:**
- Replace: `services/square-mcp/src/tools/login.ts`

- [ ] **Step 1: Implement login tool with OTP flow**

Replace `services/square-mcp/src/tools/login.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser, checkSession } from "../browser/session.js";
import { waitForPageReady } from "../browser/navigation.js";

const SQUARE_LOGIN_URL = "https://squareup.com/login";

export function registerLoginTool(server: McpServer): void {
  server.tool(
    "square_login",
    "Log in to Square. First call with phone/email triggers OTP. Second call with otp_code completes login.",
    {
      phone: z.string().optional().describe("Phone number for Square login"),
      email: z.string().optional().describe("Email for Square login"),
      otp_code: z.string().optional().describe("OTP code from SMS"),
    },
    async ({ phone, email, otp_code }) => {
      const { page } = await getBrowser();

      // If providing OTP, we're completing a login already in progress
      if (otp_code) {
        try {
          // Find the OTP input field and enter the code
          const otpInput = page.locator('input[type="text"], input[type="tel"], input[name*="code"], input[name*="otp"]').first();
          await otpInput.waitFor({ timeout: 5000 });
          await otpInput.fill(otp_code);

          // Look for a submit/verify button
          const submitButton = page.locator('button[type="submit"], button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit")').first();
          await submitButton.click();

          await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 15000 });
          await waitForPageReady(page);

          const loggedIn = await checkSession();
          if (loggedIn) {
            return { content: [{ type: "text", text: JSON.stringify({ status: "logged_in", message: "Successfully logged in to Square" }) }] };
          }
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "OTP accepted but session check failed. Try again." }) }] };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `OTP entry failed: ${msg}` }) }] };
        }
      }

      // First call — check if already logged in
      const alreadyLoggedIn = await checkSession();
      if (alreadyLoggedIn) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "logged_in", message: "Already logged in to Square" }) }] };
      }

      // Start login flow
      const credential = phone ?? email;
      if (!credential) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "Provide phone or email to start login" }) }] };
      }

      try {
        await page.goto(SQUARE_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        await waitForPageReady(page);

        // Enter phone or email
        const emailInput = page.locator('input[type="email"], input[type="tel"], input[name*="email"], input[name*="phone"], input[id*="email"]').first();
        await emailInput.waitFor({ timeout: 5000 });
        await emailInput.fill(credential);

        // Click continue/next
        const continueButton = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Next"), button:has-text("Sign In")').first();
        await continueButton.click();

        await waitForPageReady(page);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "otp_sent",
              message: `OTP sent to ${phone ? "phone" : "email"}. Call square_login again with the otp_code.`,
            }),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Login flow failed: ${msg}` }) }] };
      }
    },
  );
}
```

**Selector note:** Square's login page selectors may vary. The selectors above use broad patterns (input types, button text) to be resilient. After first real run, inspect the page and tighten selectors if needed.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd services/square-mcp && npm run build`
Expected: Compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add services/square-mcp/src/tools/login.ts
git commit -m "feat(square-mcp): login tool with OTP flow"
```

---

### Task 7: Search Times + Book Tools

**Files:**
- Replace: `services/square-mcp/src/tools/search.ts`
- Replace: `services/square-mcp/src/tools/book.ts`

- [ ] **Step 1: Implement search times tool**

Replace `services/square-mcp/src/tools/search.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser, checkSession } from "../browser/session.js";
import { loadFavorites, resolveMerchant } from "./favorites.js";
import { normalizeBookingUrl, waitForPageReady, getPageError } from "../browser/navigation.js";

export function registerSearchTool(server: McpServer, favoritesPath: string): void {
  server.tool(
    "square_search_times",
    "Find available appointment slots at a Square merchant",
    {
      merchant: z.string().describe("Merchant booking URL or favorites nickname"),
      service: z.string().optional().describe("Service name to filter by"),
      date_range: z
        .object({
          start: z.string().describe("Start date (YYYY-MM-DD)"),
          end: z.string().describe("End date (YYYY-MM-DD)"),
        })
        .optional()
        .describe("Date range to search"),
    },
    async ({ merchant, service, date_range }) => {
      const loggedIn = await checkSession();
      if (!loggedIn) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "session_expired", message: "Not logged in. Call square_login first." }) }] };
      }

      const favorites = loadFavorites(favoritesPath);
      let url: string;
      let defaultService: string | undefined;
      try {
        url = resolveMerchant(favorites, merchant);
        const fav = favorites[merchant];
        if (fav?.default_service && !service) {
          defaultService = fav.default_service;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: msg }) }] };
      }

      const { page } = await getBrowser();
      const targetService = service ?? defaultService;

      try {
        await page.goto(normalizeBookingUrl(url), { waitUntil: "domcontentloaded", timeout: 15000 });
        await waitForPageReady(page);

        const pageError = await getPageError(page);
        if (pageError) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: pageError, url }) }] };
        }

        // If a specific service is requested, try to select it
        if (targetService) {
          const serviceLink = page.locator(`text=${targetService}`).first();
          const serviceExists = (await serviceLink.count()) > 0;
          if (serviceExists) {
            await serviceLink.click();
            await waitForPageReady(page);
          }
        }

        // Extract available time slots from the page
        // Square booking pages show time buttons — look for common patterns
        const timeSlots = page.locator(
          'button[class*="time"], [data-testid*="time"], [role="button"]:has-text(/\\d{1,2}:\\d{2}/)',
        );
        const count = await timeSlots.count();
        const times: { datetime: string; service: string; provider?: string }[] = [];

        for (let i = 0; i < count; i++) {
          const text = await timeSlots.nth(i).textContent();
          if (text) {
            times.push({
              datetime: text.trim(),
              service: targetService ?? "unknown",
            });
          }
        }

        return { content: [{ type: "text", text: JSON.stringify({ times }) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Search failed: ${msg}`, url }) }] };
      }
    },
  );
}
```

- [ ] **Step 2: Implement book tool**

Replace `services/square-mcp/src/tools/book.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser, checkSession } from "../browser/session.js";
import { loadFavorites, resolveMerchant } from "./favorites.js";
import { normalizeBookingUrl, waitForPageReady, getPageError } from "../browser/navigation.js";

export function registerBookTool(server: McpServer, favoritesPath: string): void {
  server.tool(
    "square_book",
    "Book an appointment at a Square merchant. Run square_search_times first to find available slots.",
    {
      merchant: z.string().describe("Merchant booking URL or favorites nickname"),
      service: z.string().describe("Service name to book"),
      datetime: z.string().describe("Date/time to book (as shown in search results)"),
    },
    async ({ merchant, service, datetime }) => {
      const loggedIn = await checkSession();
      if (!loggedIn) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "session_expired", message: "Not logged in. Call square_login first." }) }] };
      }

      const favorites = loadFavorites(favoritesPath);
      let url: string;
      try {
        url = resolveMerchant(favorites, merchant);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: msg }) }] };
      }

      const { page } = await getBrowser();

      try {
        await page.goto(normalizeBookingUrl(url), { waitUntil: "domcontentloaded", timeout: 15000 });
        await waitForPageReady(page);

        const pageError = await getPageError(page);
        if (pageError) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", error: pageError, url }) }] };
        }

        // Select the service
        const serviceLink = page.locator(`text=${service}`).first();
        const serviceExists = (await serviceLink.count()) > 0;
        if (serviceExists) {
          await serviceLink.click();
          await waitForPageReady(page);
        }

        // Select the time slot
        const timeSlot = page.locator(`button:has-text("${datetime}"), [role="button"]:has-text("${datetime}")`).first();
        const timeExists = (await timeSlot.count()) > 0;
        if (!timeExists) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", error: `Time slot "${datetime}" not found on page` }) }] };
        }
        await timeSlot.click();
        await waitForPageReady(page);

        // Look for a confirmation/book button
        const bookButton = page.locator(
          'button:has-text("Book"), button:has-text("Confirm"), button:has-text("Schedule"), button[type="submit"]',
        ).first();
        const bookExists = (await bookButton.count()) > 0;
        if (bookExists) {
          await bookButton.click();
          await waitForPageReady(page);
        }

        // Check for success indicators
        const successText = await page
          .locator('text=/confirmed|booked|scheduled|success/i')
          .first()
          .textContent()
          .catch(() => null);

        if (successText) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "booked",
                confirmation: { datetime, service, merchant, message: successText.trim() },
              }),
            }],
          };
        }

        // Check for error messages
        const errorText = await page
          .locator('[class*="error"], [role="alert"], text=/sorry|unavailable|failed/i')
          .first()
          .textContent()
          .catch(() => null);

        if (errorText) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", error: errorText.trim() }) }] };
        }

        // Ambiguous state — return page title for debugging
        const title = await page.title();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "failed",
              error: `Booking result unclear. Page title: "${title}". User should verify manually.`,
            }),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", error: `Booking failed: ${msg}` }) }] };
      }
    },
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd services/square-mcp && npm run build`
Expected: Compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add services/square-mcp/src/tools/search.ts services/square-mcp/src/tools/book.ts
git commit -m "feat(square-mcp): search times and book tools"
```

---

### Task 8: List Bookings + Cancel Tools

**Files:**
- Replace: `services/square-mcp/src/tools/bookings.ts`

- [ ] **Step 1: Implement list bookings and cancel tools**

Replace `services/square-mcp/src/tools/bookings.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser, checkSession } from "../browser/session.js";
import { waitForPageReady } from "../browser/navigation.js";

const BOOKINGS_URL = "https://squareup.com/appointments/buyer/dashboard";

export function registerBookingsTool(server: McpServer): void {
  server.tool(
    "square_list_bookings",
    "List upcoming Square appointments",
    {},
    async () => {
      const loggedIn = await checkSession();
      if (!loggedIn) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "session_expired", message: "Not logged in. Call square_login first." }) }] };
      }

      const { page } = await getBrowser();

      try {
        await page.goto(BOOKINGS_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        await waitForPageReady(page);

        // Extract booking cards from the dashboard
        const bookingCards = page.locator(
          '[class*="appointment"], [class*="booking"], [data-testid*="appointment"]',
        );
        const count = await bookingCards.count();
        const bookings: { datetime: string; service: string; merchant: string; status: string }[] = [];

        for (let i = 0; i < count; i++) {
          const card = bookingCards.nth(i);
          const text = await card.textContent();
          if (text) {
            bookings.push({
              datetime: text.trim(),
              service: "see details",
              merchant: "see details",
              status: "upcoming",
            });
          }
        }

        // If no structured cards found, grab the page text for Bo to interpret
        if (bookings.length === 0) {
          const bodyText = await page.locator("main, [role='main'], body").first().textContent();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                bookings: [],
                page_content: bodyText?.trim().slice(0, 2000) ?? "No content found",
                message: "No structured bookings found. Page content included for interpretation.",
              }),
            }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify({ bookings }) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Failed to list bookings: ${msg}` }) }] };
      }
    },
  );
}

export function registerCancelTool(server: McpServer): void {
  server.tool(
    "square_cancel",
    "Cancel a Square appointment",
    {
      booking_id: z.string().optional().describe("Booking ID to cancel"),
      merchant: z.string().optional().describe("Merchant name to identify booking"),
      datetime: z.string().optional().describe("Date/time to identify booking"),
    },
    async ({ booking_id, merchant, datetime }) => {
      const loggedIn = await checkSession();
      if (!loggedIn) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "session_expired", message: "Not logged in. Call square_login first." }) }] };
      }

      if (!booking_id && !datetime) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "Provide booking_id or datetime to identify the booking to cancel" }) }] };
      }

      const { page } = await getBrowser();

      try {
        // Navigate to bookings dashboard
        await page.goto(BOOKINGS_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        await waitForPageReady(page);

        // Try to find the booking by datetime or ID
        const identifier = booking_id ?? datetime ?? "";
        const bookingLink = page.locator(`text=${identifier}`).first();
        const exists = (await bookingLink.count()) > 0;

        if (!exists) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Booking "${identifier}" not found on dashboard` }) }] };
        }

        await bookingLink.click();
        await waitForPageReady(page);

        // Look for cancel button
        const cancelButton = page.locator(
          'button:has-text("Cancel"), a:has-text("Cancel"), [data-testid*="cancel"]',
        ).first();
        const cancelExists = (await cancelButton.count()) > 0;

        if (!cancelExists) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "Cancel button not found on booking page" }) }] };
        }

        await cancelButton.click();
        await waitForPageReady(page);

        // Confirm cancellation if prompted
        const confirmButton = page.locator(
          'button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Cancel Appointment")',
        ).first();
        const confirmExists = (await confirmButton.count()) > 0;
        if (confirmExists) {
          await confirmButton.click();
          await waitForPageReady(page);
        }

        return { content: [{ type: "text", text: JSON.stringify({ status: "cancelled", message: `Booking "${identifier}" cancelled` }) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Cancellation failed: ${msg}` }) }] };
      }
    },
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd services/square-mcp && npm run build`
Expected: Compiles with no errors

- [ ] **Step 3: Run all unit tests**

Run: `cd services/square-mcp && npx vitest run`
Expected: All tests pass (favorites + navigation)

- [ ] **Step 4: Commit**

```bash
git add services/square-mcp/src/tools/bookings.ts
git commit -m "feat(square-mcp): list bookings and cancel tools"
```

---

### Task 9: Docker Build & Smoke Test

**Files:**
- No new files — validate the full build

- [ ] **Step 1: Build the Docker image**

Run: `cd /Users/guido/Developer/mcp-stack && docker compose build square-mcp`
Expected: Image builds successfully. Playwright installs Chromium. TypeScript compiles.

- [ ] **Step 2: Start the container**

Run: `docker compose up -d square-mcp`
Expected: Container starts, entrypoint prints status to logs.

Verify: `docker compose logs square-mcp`
Expected output includes:
```
==> square-mcp container running
    Browser data: /app/.browser-data (persistent volume)
    Favorites: /app/favorites.json (bind-mounted)
```

- [ ] **Step 3: Verify MCP tools register correctly**

Run: `docker exec -i square-mcp node dist/server.js <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'`

Expected: JSON response with server info. Then send:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | docker exec -i square-mcp node dist/server.js
```

Expected: Response includes all 6 tools: `square_login`, `square_search_times`, `square_book`, `square_list_bookings`, `square_cancel`, `square_favorites`.

- [ ] **Step 4: Test favorites tool via MCP**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"square_favorites","arguments":{"action":"list"}}}' | docker exec -i square-mcp node dist/server.js
```

Expected: Response with `{"favorites":{}}` (empty since no favorites configured yet).

- [ ] **Step 5: Commit any fixes**

If anything needed adjustment during smoke testing, commit the fixes:

```bash
git add -A services/square-mcp/
git commit -m "fix(square-mcp): smoke test fixes"
```

- [ ] **Step 6: Final commit — mark complete**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "feat(square-mcp): complete Square booking MCP service

Playwright-based MCP server for booking Square appointments.
Auth via SMS OTP, persistent browser session, favorites system.
Tools: login, search_times, book, list_bookings, cancel, favorites."
```

---

## Important Notes

**Selector fragility:** The Playwright selectors for Square's login, booking, and dashboard pages are best-effort patterns based on common web UI conventions. After the first real run against Square's live site, selectors will likely need tuning. The tool structure is designed so that selector changes are localized to individual tool files.

**First real test:** After Task 9, have Bo try `square_login` with the user's phone number. This will be the real validation — if Square's page structure differs from expectations, the login tool's selectors will need adjustment. Fix and re-deploy iteratively.
