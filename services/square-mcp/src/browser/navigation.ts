import type { Page } from "playwright";

export function normalizeBookingUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  // Give dynamic content a moment to render
  await page.waitForTimeout(1500);
}

export async function getPageError(page: Page): Promise<string | null> {
  // Check for common error states
  const notFound = await page.locator("text=Page not found").count();
  if (notFound > 0) return "Page not found";

  const blocked = await page.locator("text=Access denied").count();
  if (blocked > 0) return "Access denied — possible Cloudflare block";

  return null;
}

export async function extractTextContent(
  page: Page,
  selector: string,
): Promise<string[]> {
  const elements = page.locator(selector);
  const count = await elements.count();
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await elements.nth(i).textContent();
    if (text) results.push(text.trim());
  }
  return results;
}
