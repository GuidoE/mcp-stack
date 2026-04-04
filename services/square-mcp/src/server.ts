import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { loadFavorites, saveFavorites, addFavorite, removeFavorite } from "./tools/favorites.js";
import { registerLoginTool } from "./tools/login.js";
import { registerSearchTool } from "./tools/search.js";
import { registerBookTool } from "./tools/book.js";
import { registerBookingsTool, registerCancelTool } from "./tools/bookings.js";
import { closeBrowser } from "./browser/session.js";

const FAVORITES_PATH = process.env.FAVORITES_PATH ?? "/app/favorites.json";
const MCP_TRANSPORT = process.env.MCP_TRANSPORT ?? "sse";
const MCP_PORT = parseInt(process.env.MCP_PORT ?? "3003", 10);

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

// ---- Transport ----
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

if (MCP_TRANSPORT === "stdio") {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  // SSE mode — HTTP server for remote agents (like Bo on OpenClaw)
  const app = express();
  let sseTransport: SSEServerTransport | null = null;

  app.get("/sse", async (_req, res) => {
    if (sseTransport) {
      await sseTransport.close();
    }
    sseTransport = new SSEServerTransport("/messages", res);
    await server.connect(sseTransport);
  });

  app.post("/messages", async (req, res) => {
    if (!sseTransport) {
      res.status(400).json({ error: "No SSE connection established" });
      return;
    }
    await sseTransport.handlePostMessage(req, res);
  });

  app.listen(MCP_PORT, "0.0.0.0", () => {
    console.error(`==> square-mcp SSE server listening on 0.0.0.0:${MCP_PORT}`);
  });
}
