import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser } from "../browser/session.js";
import { loadFavorites, resolveMerchant } from "./favorites.js";
import { normalizeBookingUrl } from "../browser/navigation.js";

export function registerSearchTool(server: McpServer, favoritesPath: string): void {
  server.tool(
    "square_search_times",
    "Find available appointment slots at a Square merchant. Navigates the booking wizard and browses multiple days. Returns all available slots across the requested range.",
    {
      merchant: z.string().describe("Merchant booking URL or favorites nickname"),
      service: z.string().optional().describe("Stylist/staff name to select (e.g. 'Vi')"),
      service_option: z.string().optional().describe("Specific service to book (e.g. 'short length haircut')"),
      days_to_check: z.number().optional().describe("Number of days to browse from next available (default 7)"),
    },
    async ({ merchant, service, service_option, days_to_check }) => {
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
      const numDays = days_to_check ?? 7;

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

        // STEP 1: Select staff member
        if (targetService) {
          const match = page.locator(`text=${targetService}`).first();
          if ((await match.count()) > 0) {
            await match.click();
            await page.waitForTimeout(3000);
          }
        }

        // STEP 2: Select service
        if (service_option) {
          const svcMatch = page.locator(`text=${service_option}`).first();
          if ((await svcMatch.count()) > 0) {
            await svcMatch.click();
            await page.waitForTimeout(2000);
          }
        } else {
          const serviceItems = page.locator('text=/\\$\\d+/');
          if ((await serviceItems.count()) > 0) {
            await serviceItems.first().click();
            await page.waitForTimeout(2000);
          }
        }

        // STEP 3: Add
        const addBtn = page.getByText("Add", { exact: true });
        if ((await addBtn.count()) > 0) {
          await addBtn.first().click();
          await page.waitForTimeout(2000);
        }

        // STEP 4: Next → calendar
        const nextBtn = page.getByText("Next", { exact: true });
        if ((await nextBtn.count()) > 0) {
          await nextBtn.first().click();
          await page.waitForTimeout(5000);
        }

        // STEP 5: Go to next available
        const nextAvail = page.getByText("Go to next available");
        if ((await nextAvail.count()) > 0) {
          await nextAvail.click();
          await page.waitForTimeout(3000);
        }

        // STEP 6: Toggle calendar to week/month view for date browsing
        const collapseBtn = page.locator('button[aria-label*="Collapse"][aria-label*="week"]');
        if ((await collapseBtn.count()) > 0) {
          await collapseBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(2000);
        }

        // STEP 7: Get the starting day number from current page
        const startBody = await page.locator("body").textContent() ?? "";
        const startDateMatch = startBody.match(/\w+,\s+\w+\s+(\d{1,2}),\s+\d{4}/);
        const startDay = startDateMatch ? parseInt(startDateMatch[1], 10) : 6;

        // STEP 8: Browse multiple days using JS evaluate to click date buttons
        const allSlots: { date: string; times: string[] }[] = [];

        for (let i = 0; i < numDays; i++) {
          const dayNum = startDay + i;

          // Click the date button via JS (bypasses visibility — dates in scrollable strip)
          await page.evaluate((d: number) => {
            const btns = document.querySelectorAll("market-button");
            for (const b of btns) {
              const text = (b.textContent ?? "").trim();
              if (new RegExp(`(Mo|Tu|We|Th|Fr|Sa|Su)\\s+${d}$`).test(text)) {
                (b as HTMLElement).click();
                return;
              }
            }
          }, dayNum);

          await page.waitForTimeout(2000);

          const body = await page.locator("body").textContent() ?? "";
          const datePattern = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d{1,2},\s+\d{4}/;
          const dateMatch = body.match(datePattern);
          const dateName = dateMatch?.[0] ?? `Day ${dayNum}`;
          const timePattern = /\d{1,2}:\d{2}\s*(?:AM|PM)/gi;
          const times = body.match(timePattern) ?? [];
          const noAvail = body.includes("No availability");

          if (times.length > 0) {
            // Deduplicate times
            const uniqueTimes = [...new Set(times)];
            allSlots.push({ date: dateName, times: uniqueTimes });
          }
        }

        if (allSlots.length > 0) {
          return { content: [{ type: "text", text: JSON.stringify({
            slots: allSlots,
            days_checked: numDays,
            provider: targetService ?? "unknown",
            service: service_option ?? "first available",
          }) }] };
        }

        return { content: [{ type: "text", text: JSON.stringify({
          slots: [],
          days_checked: numDays,
          message: `No available slots found in the next ${numDays} days.`,
        }) }] };

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Search failed: ${msg}`, url }) }] };
      }
    },
  );
}
