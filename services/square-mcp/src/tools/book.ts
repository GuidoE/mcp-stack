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
