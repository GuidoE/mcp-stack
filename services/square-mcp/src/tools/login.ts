import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser, checkSession } from "../browser/session.js";

// Buyer login — uses OTP (not the merchant dashboard login which asks for password)
const SQUARE_BUYER_LOGIN_URL = "https://app.squareup.com/login?app=appointments";

export function registerLoginTool(server: McpServer): void {
  server.tool(
    "square_login",
    "Log in to Square as a buyer. First call with phone triggers an OTP code via SMS. Second call with otp_code completes login.",
    {
      phone: z.string().optional().describe("Phone number for Square login"),
      email: z.string().optional().describe("Email for Square login"),
      otp_code: z.string().optional().describe("OTP code from SMS"),
    },
    async ({ phone, email, otp_code }) => {
      const { page } = await getBrowser();

      // If providing OTP, complete the login
      if (otp_code) {
        try {
          // Find OTP input — could be tel, text, or any visible input on the code page
          const otpInput = page.locator('input[type="tel"]:visible, input[type="text"]:visible, input[type="number"]:visible').first();
          await otpInput.waitFor({ timeout: 5000 });
          await otpInput.fill(otp_code);
          await page.waitForTimeout(1000);

          // Click verify/submit — market-button or regular button
          const verifyBtn = page.locator('market-button:visible').filter({ hasText: /verify|confirm|sign in|continue|submit/i });
          if ((await verifyBtn.count()) > 0) {
            await verifyBtn.first().click();
          } else {
            // Fallback: press Enter
            await page.keyboard.press("Enter");
          }

          await page.waitForTimeout(8000);

          const loggedIn = await checkSession();
          if (loggedIn) {
            return { content: [{ type: "text", text: JSON.stringify({ status: "logged_in", message: "Successfully logged in to Square" }) }] };
          }

          // Check if we landed back on the booking page (also counts as success)
          const url = page.url();
          if (url.includes("book.squareup.com") || url.includes("/appointments")) {
            return { content: [{ type: "text", text: JSON.stringify({ status: "logged_in", message: "Logged in — redirected to booking page" }) }] };
          }

          const body = await page.locator("body").textContent() ?? "";
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "OTP submitted but login unclear", page_url: url, page_content: body.trim().substring(0, 500) }) }] };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `OTP entry failed: ${msg}` }) }] };
        }
      }

      // First call — check if already logged in
      const alreadyLoggedIn = await checkSession();
      if (alreadyLoggedIn) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "logged_in", message: "Already logged in to Square" }) }] };
      }

      // Start buyer login flow
      const credential = phone ?? email;
      if (!credential) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "Provide phone or email to start login" }) }] };
      }

      try {
        await page.goto(SQUARE_BUYER_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(5000);

        // Fill phone number — buyer login uses type="tel" with aria-label="Mobile Phone Number"
        const phoneInput = page.locator('input[type="tel"]:visible, input[aria-label*="Phone"]:visible, #mpui-combo-field-input').first();
        await phoneInput.waitFor({ timeout: 5000 });
        await phoneInput.fill(credential);
        await page.waitForTimeout(1000);

        // Click "Request Sign in Code" button
        const requestCodeBtn = page.locator('market-button:visible').filter({ hasText: /request|send|code|continue/i });
        if ((await requestCodeBtn.count()) > 0) {
          await requestCodeBtn.first().click();
        } else {
          await page.keyboard.press("Enter");
        }

        await page.waitForTimeout(5000);

        // Check what page we're on now
        const body = await page.locator("body").textContent() ?? "";
        const url = page.url();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "otp_sent",
              message: `Sign-in code requested for ${credential}. Ask the user for the code, then call square_login again with otp_code.`,
              page_url: url,
            }),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: `Login flow failed: ${msg}` }) }] };
      }
    },
  );
}
