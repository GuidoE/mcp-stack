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
