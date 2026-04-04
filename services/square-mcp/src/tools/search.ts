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
    async ({ merchant, service, date_range: _date_range }) => {
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
