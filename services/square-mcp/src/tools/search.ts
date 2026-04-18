import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Page } from "playwright";
import { z } from "zod";
import { getBrowser } from "../browser/session.js";
import { loadFavorites, resolveMerchant } from "./favorites.js";
import { normalizeBookingUrl } from "../browser/navigation.js";

const DAY_ABBRS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Click the forward arrow on Square's calendar. Returns true if a button was found. */
async function clickForwardArrow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Square uses market-button or plain button with aria-label patterns
    const selectors = [
      'button[aria-label*="next" i]',
      'market-button[aria-label*="next" i]',
      'button[aria-label*="forward" i]',
      'market-button[aria-label*="forward" i]',
      '[data-testid*="next"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) { el.click(); return true; }
    }
    // Fallback: look for a right-arrow SVG button (common calendar pattern)
    for (const btn of document.querySelectorAll("button, market-button")) {
      const label = btn.getAttribute("aria-label") ?? "";
      if (/next|forward|chevron.?right/i.test(label)) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
}

/** Check if a date button with the given day-of-week abbreviation and day number exists in the DOM. */
async function dateButtonExists(page: Page, dayAbbr: string, dayNum: number): Promise<boolean> {
  return page.evaluate(({ abbr, day }) => {
    for (const b of document.querySelectorAll("market-button")) {
      const text = (b.textContent ?? "").trim();
      if (new RegExp(`${abbr}\\s+${day}$`).test(text)) return true;
    }
    return false;
  }, { abbr: dayAbbr, day: dayNum });
}

/** Click a date button by day-of-week abbreviation and day number. */
async function clickDateButton(page: Page, dayAbbr: string, dayNum: number): Promise<boolean> {
  return page.evaluate(({ abbr, day }) => {
    for (const b of document.querySelectorAll("market-button")) {
      const text = (b.textContent ?? "").trim();
      if (new RegExp(`${abbr}\\s+${day}$`).test(text)) {
        (b as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, { abbr: dayAbbr, day: dayNum });
}

export function registerSearchTool(server: McpServer, favoritesPath: string): void {
  server.tool(
    "square_search_times",
    "Find available appointment slots at a Square merchant. Navigates the booking wizard, then clicks each calendar date individually to load its time slots. Returns every date checked — both available and unavailable.",
    {
      merchant: z.string().describe("Merchant booking URL or favorites nickname"),
      service: z.string().optional().describe("Stylist/staff name to select (e.g. 'Vi')"),
      service_option: z.string().optional().describe("Specific service to book (e.g. 'short length haircut')"),
      days_to_check: z.number().optional().describe("Number of days to browse (default 7)"),
      start_date: z.string().optional().describe("Start browsing from this date (YYYY-MM-DD). If omitted, starts from the first available date."),
    },
    async ({ merchant, service, service_option, days_to_check, start_date }) => {
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

        // STEP 5: Go to next available to enter the calendar view
        const nextAvail = page.getByText("Go to next available");
        if ((await nextAvail.count()) > 0) {
          await nextAvail.click();
          await page.waitForTimeout(3000);
        }

        // STEP 6: Build the list of actual Date objects to check.
        // This handles month boundaries correctly (Apr 30 → May 1).
        let baseDate: Date;
        if (start_date) {
          baseDate = new Date(start_date + "T12:00:00");
        } else {
          const pageText = await page.locator("body").textContent() ?? "";
          const dm = pageText.match(/\w+,\s+(\w+\s+\d{1,2},\s+\d{4})/);
          baseDate = dm ? new Date(dm[1]) : new Date();
        }

        const targetDates: Date[] = [];
        for (let i = 0; i < numDays; i++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + i);
          targetDates.push(d);
        }

        // STEP 7: Navigate the calendar forward until the first target date is visible.
        if (start_date) {
          const first = targetDates[0];
          const firstAbbr = DAY_ABBRS[first.getDay()];
          const firstDay = first.getDate();

          for (let attempt = 0; attempt < 20; attempt++) {
            if (await dateButtonExists(page, firstAbbr, firstDay)) break;
            if (!(await clickForwardArrow(page))) break;
            await page.waitForTimeout(2000);
          }
        }

        // STEP 8: Click each date individually, wait for slots to load, extract times.
        const allSlots: { date: string; times: string[] }[] = [];
        const noAvailDates: string[] = [];

        for (const target of targetDates) {
          const dayNum = target.getDate();
          const dayAbbr = DAY_ABBRS[target.getDay()];
          const dateLabel = target.toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          });

          // Ensure the date button is in the DOM; navigate forward if needed
          if (!(await dateButtonExists(page, dayAbbr, dayNum))) {
            if (await clickForwardArrow(page)) {
              await page.waitForTimeout(2000);
            }
            // If still not visible after advancing, record and skip
            if (!(await dateButtonExists(page, dayAbbr, dayNum))) {
              noAvailDates.push(dateLabel);
              continue;
            }
          }

          // Click the date
          await clickDateButton(page, dayAbbr, dayNum);

          await page.waitForTimeout(2000);

          // Extract times from the page
          const body = await page.locator("body").textContent() ?? "";
          const timePattern = /\d{1,2}:\d{2}\s*(?:AM|PM)/gi;
          const times = body.match(timePattern) ?? [];

          if (times.length > 0) {
            const uniqueTimes = [...new Set(times)];
            allSlots.push({ date: dateLabel, times: uniqueTimes });
          } else {
            noAvailDates.push(dateLabel);
          }
        }

        return { content: [{ type: "text", text: JSON.stringify({
          slots: allSlots,
          no_availability: noAvailDates,
          days_checked: numDays,
          provider: targetService ?? "unknown",
          service: service_option ?? "first available",
        }) }] };

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Search failed: ${msg}`, url }) }] };
      }
    },
  );
}
