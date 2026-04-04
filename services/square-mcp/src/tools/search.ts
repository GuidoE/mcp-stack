import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser } from "../browser/session.js";
import { loadFavorites, resolveMerchant } from "./favorites.js";
import { normalizeBookingUrl, waitForPageReady } from "../browser/navigation.js";

export function registerSearchTool(server: McpServer, favoritesPath: string): void {
  server.tool(
    "square_search_times",
    "Find available appointment slots at a Square merchant. The booking page is a wizard: first you see stylists/staff, then services, then times. Pass 'service' to select a stylist by name.",
    {
      merchant: z.string().describe("Merchant booking URL or favorites nickname"),
      service: z.string().optional().describe("Stylist or service name to select on the booking page"),
      date_range: z
        .object({
          start: z.string().describe("Start date (YYYY-MM-DD)"),
          end: z.string().describe("End date (YYYY-MM-DD)"),
        })
        .optional()
        .describe("Date range to search (not yet implemented — returns current visible times)"),
    },
    async ({ merchant, service, date_range: _date_range }) => {
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
        await page.goto(normalizedUrl, { waitUntil: "networkidle", timeout: 30000 });
        await waitForPageReady(page);

        // Check for 404 / not found
        const bodyText = await page.locator("body").textContent() ?? "";
        if (bodyText.includes("Not found") || bodyText.includes("couldn't find")) {
          return { content: [{ type: "text", text: JSON.stringify({
            status: "failed",
            message: "Page not found. Make sure the booking URL is correct. Square booking URLs look like: https://book.squareup.com/appointments/MERCHANT_ID/location/LOCATION_ID/services",
            url: normalizedUrl,
          }) }] };
        }

        // Square booking pages are a wizard: staff list → service list → time slots
        // If a service/stylist name is provided, click on it to advance the wizard
        if (targetService) {
          // Try clicking an element containing the target text
          const match = page.locator(`text=${targetService}`).first();
          const matchExists = (await match.count()) > 0;
          if (matchExists) {
            await match.click();
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            await waitForPageReady(page);

            // After clicking a stylist, there may be a service selection step
            // Look for a "Next" button or service cards
            const nextBtn = page.locator('button:has-text("Next"), a:has-text("Next")').first();
            const nextExists = (await nextBtn.count()) > 0;
            if (nextExists) {
              await nextBtn.click();
              await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
              await waitForPageReady(page);
            }
          }
        }

        // Now extract what's on the current page — could be staff list, services, or time slots
        const currentBody = await page.locator("body").textContent() ?? "";
        const currentUrl = page.url();
        const title = await page.title();

        // Look for time slots (buttons/elements with time patterns)
        const allClickables = page.locator('button, [role="button"], a, [role="link"]');
        const clickableCount = await allClickables.count();
        const timePattern = /\d{1,2}:\d{2}\s*(am|pm|AM|PM)/;
        const times: { datetime: string; service: string; provider?: string }[] = [];

        for (let i = 0; i < clickableCount; i++) {
          const text = await allClickables.nth(i).textContent();
          const visible = await allClickables.nth(i).isVisible();
          if (text && visible && timePattern.test(text)) {
            times.push({
              datetime: text.trim(),
              service: targetService ?? "unknown",
            });
          }
        }

        if (times.length > 0) {
          return { content: [{ type: "text", text: JSON.stringify({ times }) }] };
        }

        // No times found — return the page content so the caller can understand
        // what step of the wizard we're on and what to do next
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              times: [],
              current_url: currentUrl,
              page_title: title,
              page_content: currentBody.trim().substring(0, 3000),
              hint: "No time slots found on current page. The booking flow is a multi-step wizard. You may need to: 1) Select a stylist/staff member, 2) Select a service, 3) Click 'Next' to advance to the calendar. Try calling square_search_times again with the 'service' parameter set to the stylist or service name shown in page_content.",
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
