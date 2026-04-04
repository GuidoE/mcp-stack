import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { loadFavorites, saveFavorites, addFavorite, removeFavorite } from "./tools/favorites.js";
import { registerLoginTool } from "./tools/login.js";
import { registerSearchTool } from "./tools/search.js";
import { registerBookTool } from "./tools/book.js";
import { registerBookingsTool, registerCancelTool } from "./tools/bookings.js";
import { closeBrowser, getBrowser } from "./browser/session.js";

const FAVORITES_PATH = process.env.FAVORITES_PATH ?? "/app/favorites.json";
const MCP_TRANSPORT = process.env.MCP_TRANSPORT ?? "sse";
const MCP_PORT = parseInt(process.env.MCP_PORT ?? "3003", 10);

function createServer(): McpServer {
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

  return server;
}

// ---- Transport ----
process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

if (MCP_TRANSPORT === "stdio") {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  // Streamable HTTP mode — matches how playwright-mcp exposes /mcp
  // Each session gets its own McpServer + transport, but they share
  // the browser singleton (module-level in session.ts).
  const app = express();
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  app.all("/mcp", async (req, res) => {
    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — only on POST (initialization)
    if (req.method === "POST") {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      // Store session after handling (sessionId is set after first request)
      if (transport.sessionId) {
        sessions.set(transport.sessionId, { server, transport });
        console.error(`[mcp] new session: ${transport.sessionId}`);
      }
      return;
    }

    // GET for SSE stream on existing session (handled above), or new GET without session
    if (req.method === "GET") {
      res.status(405).json({ error: "Method not allowed. POST to /mcp to initialize." });
      return;
    }

    res.status(400).json({ error: "Bad request" });
  });

  // Also keep legacy /sse for backwards compatibility
  app.get("/sse", (_req, res) => {
    res.status(410).json({ error: "Legacy SSE endpoint deprecated. Use /mcp instead." });
  });

  app.listen(MCP_PORT, "0.0.0.0", () => {
    console.error(`==> square-mcp Streamable HTTP server listening on 0.0.0.0:${MCP_PORT}`);
    console.error(`    Endpoint: http://0.0.0.0:${MCP_PORT}/mcp`);
    getBrowser().catch((err) => console.error("[browser] eager launch failed:", err));
  });
}
