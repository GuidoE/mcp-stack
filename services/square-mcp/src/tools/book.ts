import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser } from "../browser/session.js";

export function registerBookTool(server: McpServer, _favoritesPath: string): void {
  server.tool(
    "square_book",
    "Book an appointment. MUST run square_search_times first — the browser is already on the calendar page. This tool clicks the time slot and confirms the booking.",
    {
      time: z.string().describe("Time to book exactly as shown in search results (e.g. '9:00 AM', '3:30 PM')"),
    },
    async ({ time }) => {
      const { page } = await getBrowser();

      try {
        const currentUrl = page.url();
        const currentBody = await page.locator("body").textContent() ?? "";

        // If we're on the checkout page, handle it directly
        if (currentUrl.includes("/checkout") || currentBody.includes("Cancellation policy")) {
          // Check the cancellation policy checkbox
          const policyCheckbox = page.locator('input[type="checkbox"], market-checkbox, [role="checkbox"]').first();
          if ((await policyCheckbox.count()) > 0) {
            const isChecked = await policyCheckbox.isChecked().catch(() => false);
            if (!isChecked) {
              await policyCheckbox.click({ force: true });
              await page.waitForTimeout(1000);
            }
          }
          // Also try clicking the label text if checkbox didn't work
          const policyLabel = page.getByText("I have read and agreed", { exact: false });
          if ((await policyLabel.count()) > 0) {
            await policyLabel.click();
            await page.waitForTimeout(1000);
          }
        } else if (currentUrl.includes("/availability") || currentBody.match(/\d{1,2}:\d{2}\s*(am|pm)/i)) {
          // On calendar page — click the time slot
          const timeSlot = page.getByText(time, { exact: false }).first();
          if ((await timeSlot.count()) === 0) {
            return { content: [{ type: "text", text: JSON.stringify({
              status: "failed",
              error: `Time "${time}" not found on page.`,
            }) }] };
          }
          await timeSlot.click();
          await page.waitForTimeout(3000);
        }

        // Look for Book/Confirm button
        const body = await page.locator("body").textContent() ?? "";
        const url = page.url();

        // Try market-button first (Square's web component)
        const confirmBtn = page.locator('market-button:visible').filter({ hasText: /book appointment|book|confirm|schedule|complete/i });
        if ((await confirmBtn.count()) > 0) {
          await confirmBtn.first().click();
          await page.waitForTimeout(5000);

          const afterBody = await page.locator("body").textContent() ?? "";
          const afterUrl = page.url();

          // Check for success
          if (/confirmed|booked|scheduled|success|thank you/i.test(afterBody)) {
            return { content: [{ type: "text", text: JSON.stringify({
              status: "booked",
              confirmation: { time, page_url: afterUrl, message: afterBody.trim().substring(0, 500) },
            }) }] };
          }

          // Return whatever we see
          return { content: [{ type: "text", text: JSON.stringify({
            status: "unknown",
            message: "Clicked confirm but couldn't verify success. Check page content.",
            page_url: afterUrl,
            page_content: afterBody.trim().substring(0, 1500),
          }) }] };
        }

        // No confirm button — might need login, or we're on a review page
        // Return page content so Bo can figure out next step
        return { content: [{ type: "text", text: JSON.stringify({
          status: "needs_action",
          message: "Time selected but no confirm button found. Page may require login or additional steps.",
          page_url: url,
          page_content: body.trim().substring(0, 1500),
        }) }] };

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", error: `Booking failed: ${msg}` }) }] };
      }
    },
  );
}
