import { chromium, type BrowserContext, type Page } from "playwright";

const BROWSER_DATA_DIR = process.env.BROWSER_DATA_DIR ?? "/app/.browser-data";
const SQUARE_ACCOUNT_URL = "https://squareup.com/appointments/buyer/dashboard";

let context: BrowserContext | null = null;
let page: Page | null = null;

export async function getBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  if (context && page && !page.isClosed()) {
    return { context, page };
  }

  context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function checkSession(): Promise<boolean> {
  const { page } = await getBrowser();
  try {
    await page.goto(SQUARE_ACCOUNT_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    const url = page.url();
    // If we weren't redirected to login, session is valid
    return !url.includes("/login");
  } catch {
    return false;
  }
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
    page = null;
  }
}
