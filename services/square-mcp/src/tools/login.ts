import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser, checkSession } from "../browser/session.js";
import { waitForPageReady } from "../browser/navigation.js";

const SQUARE_LOGIN_URL = "https://squareup.com/login";

export function registerLoginTool(server: McpServer): void {
  server.tool(
    "square_login",
    "Log in to Square. First call with phone/email triggers OTP. Second call with otp_code completes login.",
    {
      phone: z.string().optional().describe("Phone number for Square login"),
      email: z.string().optional().describe("Email for Square login"),
      otp_code: z.string().optional().describe("OTP code from SMS"),
    },
    async ({ phone, email, otp_code }) => {
      const { page } = await getBrowser();

      // If providing OTP, we're completing a login already in progress
      if (otp_code) {
        try {
          // Find the OTP input field and enter the code
          const otpInput = page.locator('input[type="text"], input[type="tel"], input[name*="code"], input[name*="otp"]').first();
          await otpInput.waitFor({ timeout: 5000 });
          await otpInput.fill(otp_code);

          // Look for a submit/verify button
          const submitButton = page.locator('button[type="submit"], button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit")').first();
          await submitButton.click();

          await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 15000 });
          await waitForPageReady(page);

          const loggedIn = await checkSession();
          if (loggedIn) {
            return { content: [{ type: "text", text: JSON.stringify({ status: "logged_in", message: "Successfully logged in to Square" }) }] };
          }
          return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "OTP accepted but session check failed. Try again." }) }] };
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

      // Start login flow
      const credential = phone ?? email;
      if (!credential) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", message: "Provide phone or email to start login" }) }] };
      }

      try {
        await page.goto(SQUARE_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        await waitForPageReady(page);

        // Enter phone or email
        const emailInput = page.locator('input[type="email"], input[type="tel"], input[name*="email"], input[name*="phone"], input[id*="email"]').first();
        await emailInput.waitFor({ timeout: 5000 });
        await emailInput.fill(credential);

        // Click continue/next
        const continueButton = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Next"), button:has-text("Sign In")').first();
        await continueButton.click();

        await waitForPageReady(page);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "otp_sent",
              message: `OTP sent to ${phone ? "phone" : "email"}. Call square_login again with the otp_code.`,
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
