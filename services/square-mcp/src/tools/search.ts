import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser } from "../browser/session.js";
import { loadFavorites, resolveMerchant } from "./favorites.js";
import { normalizeBookingUrl } from "../browser/navigation.js";

export function registerSearchTool(server: McpServer, favoritesPath: string): void {
  server.tool(
    "square_search_times",
    "Find available appointment slots at a Square merchant. Navigates the full booking wizard: staff → service → Add → Next → calendar. Pass 'service' to select a stylist by name, 'service_option' to pick a specific service.",
    {
      merchant: z.string().describe("Merchant booking URL or favorites nickname"),
      service: z.string().optional().describe("Stylist/staff name to select (e.g. 'Vi')"),
      service_option: z.string().optional().describe("Specific service to book (e.g. 'short length haircut')"),
      date_range: z
        .object({
          start: z.string().describe("Start date (YYYY-MM-DD)"),
          end: z.string().describe("End date (YYYY-MM-DD)"),
        })
        .optional()
        .describe("Date range to search (currently shows next available)"),
    },
    async ({ merchant, service, service_option, date_range: _date_range }) => {
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
        const normalizedUrl = normalizeBookingUrl(url);
        await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(5000);

        // Check for 404
        const bodyText = await page.locator("body").textContent() ?? "";
        if (bodyText.includes("Not found") || bodyText.includes("couldn't find")) {
          return { content: [{ type: "text", text: JSON.stringify({
            status: "failed",
            message: "Page not found. Square booking URLs look like: https://book.squareup.com/appointments/MERCHANT_ID/location/LOCATION_ID/services",
            url: normalizedUrl,
          }) }] };
        }

        // STEP 1: Select staff member if specified
        if (targetService) {
          const match = page.locator(`text=${targetService}`).first();
          if ((await match.count()) > 0) {
            await match.click();
            await page.waitForTimeout(3000);
          }
        }

        // STEP 2: Select specific service if specified
        if (service_option) {
          const svcMatch = page.locator(`text=${service_option}`).first();
          if ((await svcMatch.count()) > 0) {
            await svcMatch.click();
            await page.waitForTimeout(2000);
          }
        } else {
          // Auto-select first service option if none specified
          // Look for price indicators (services have prices like "$55.00")
          const serviceItems = page.locator('text=/\\$\\d+/');
          if ((await serviceItems.count()) > 0) {
            await serviceItems.first().click();
            await page.waitForTimeout(2000);
          }
        }

        // STEP 3: Click "Add" button
        const addBtn = page.getByText("Add", { exact: true });
        if ((await addBtn.count()) > 0) {
          await addBtn.first().click();
          await page.waitForTimeout(2000);
        }

        // STEP 4: Click "Next" button to go to calendar
        const nextBtn = page.getByText("Next", { exact: true });
        if ((await nextBtn.count()) > 0) {
          await nextBtn.first().click();
          await page.waitForTimeout(5000);
        }

        // STEP 5: If "no availability" shown, click "Go to next available"
        const nextAvail = page.getByText("Go to next available");
        if ((await nextAvail.count()) > 0) {
          await nextAvail.click();
          await page.waitForTimeout(5000);
        }

        // STEP 6: Extract time slots and date info
        const currentBody = await page.locator("body").textContent() ?? "";
        const currentUrl = page.url();
        const timePattern = /\d{1,2}:\d{2}\s*(am|pm|AM|PM)/gi;
        const timeMatches = currentBody.match(timePattern) ?? [];

        // Extract the date being shown
        const datePattern = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d{1,2},\s+\d{4}/;
        const dateMatch = currentBody.match(datePattern);
        const dateShown = dateMatch?.[0] ?? "unknown date";

        if (timeMatches.length > 0) {
          const times = timeMatches.map((t) => ({
            datetime: `${dateShown} at ${t}`,
            service: service_option ?? "first available service",
            provider: targetService ?? "unknown",
          }));
          return { content: [{ type: "text", text: JSON.stringify({ times, date: dateShown, url: currentUrl }) }] };
        }

        // No times — return what we see
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              times: [],
              date: dateShown,
              current_url: currentUrl,
              page_content: currentBody.trim().substring(0, 3000),
              hint: "No time slots found. The page may show a staff list or service list. Try specifying 'service' (stylist name) and 'service_option' (e.g. 'short length haircut').",
            }),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Search failed: ${msg}`, url }) }] };
      }
    },
  );
}
