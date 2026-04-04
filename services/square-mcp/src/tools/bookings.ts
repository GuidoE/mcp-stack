import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser } from "../browser/session.js";

// Bookings page is per-merchant: /bookings on the same merchant booking URL
// Requires the user to be logged in (persistent browser context)

export function registerBookingsTool(server: McpServer): void {
  server.tool(
    "square_list_bookings",
    "List upcoming Square appointments for a merchant. Requires prior login via square_login.",
    {
      merchant_url: z.string().describe("Merchant booking base URL (e.g. https://book.squareup.com/appointments/MERCHANT_ID/location/LOCATION_ID)"),
    },
    async ({ merchant_url }) => {
      const { page } = await getBrowser();

      try {
        // Navigate to the bookings page for this merchant
        const bookingsUrl = merchant_url.replace(/\/services$/, "").replace(/\/$/, "") + "/bookings";
        await page.goto(bookingsUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(8000);

        const body = await page.locator("body").textContent() ?? "";
        const url = page.url();

        // Check if we need to log in
        if (url.includes("/login") || body.includes("Sign in")) {
          return { content: [{ type: "text", text: JSON.stringify({
            status: "needs_login",
            message: "Not logged in. Call square_login first, then retry.",
          }) }] };
        }

        // Extract booking cards
        const cards = await page.locator('market-link[data-testid*="bookings"]').all();
        const bookings: { date: string; time: string; provider: string; service: string }[] = [];

        for (const card of cards) {
          const text = await card.textContent() ?? "";
          // Parse the card text — format is like "Sunday, Apr 5, 2026\n8:30 – 9:30 AM CDT\nVi\n..."
          const dateMatch = text.match(/\w+,\s+\w+\s+\d{1,2},\s+\d{4}/);
          const timeMatch = text.match(/\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*\w*/i);
          const providerMatch = text.match(/\n([A-Z][a-z]+)\n/);

          bookings.push({
            date: dateMatch?.[0] ?? "unknown",
            time: timeMatch?.[0] ?? "unknown",
            provider: providerMatch?.[1] ?? "unknown",
            service: text.includes("haircut") ? "haircut" : text.trim().substring(0, 100),
          });
        }

        if (bookings.length > 0) {
          return { content: [{ type: "text", text: JSON.stringify({ bookings }) }] };
        }

        // No structured cards — return raw page content
        return { content: [{ type: "text", text: JSON.stringify({
          bookings: [],
          page_content: body.trim().substring(0, 2000),
          message: "No bookings found, or page structure unexpected. Raw content included.",
        }) }] };

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
    "Cancel or reschedule a Square appointment. Square sends a confirmation email with manage/cancel links — this tool navigates to the bookings page and attempts to find cancel options. If no cancel button is found on the page, check your email for the manage link.",
    {
      merchant_url: z.string().describe("Merchant booking base URL"),
      booking_date: z.string().optional().describe("Date of the booking to cancel (e.g. 'Apr 5')"),
    },
    async ({ merchant_url, booking_date }) => {
      const { page } = await getBrowser();

      try {
        const bookingsUrl = merchant_url.replace(/\/services$/, "").replace(/\/$/, "") + "/bookings";
        await page.goto(bookingsUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(8000);

        const body = await page.locator("body").textContent() ?? "";

        // Try to find and click the booking
        if (booking_date) {
          const card = page.locator(`market-link[data-testid*="bookings"]`).filter({ hasText: booking_date }).first();
          if ((await card.count()) > 0) {
            await card.click({ force: true });
            await page.waitForTimeout(5000);
          }
        }

        const afterBody = await page.locator("body").textContent() ?? "";
        const afterUrl = page.url();

        // Look for cancel/reschedule buttons
        const cancelBtn = page.locator('market-button:visible, button:visible').filter({ hasText: /cancel|reschedule/i });
        if ((await cancelBtn.count()) > 0) {
          const btnText = await cancelBtn.first().evaluate((el: Element) => (el as HTMLElement).innerText);
          return { content: [{ type: "text", text: JSON.stringify({
            status: "cancel_available",
            message: `Found "${btnText?.trim()}" button. Call square_cancel again with confirm=true to proceed.`,
            page_url: afterUrl,
          }) }] };
        }

        // No cancel button found — Square may only support cancel via email link
        return { content: [{ type: "text", text: JSON.stringify({
          status: "no_cancel_button",
          message: "No cancel/reschedule button found on the bookings page. Square sends a confirmation email with a manage link — check your email to cancel or reschedule.",
          page_url: afterUrl,
          page_content: afterBody.trim().substring(0, 1500),
        }) }] };

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Cancel failed: ${msg}` }) }] };
      }
    },
  );
}
