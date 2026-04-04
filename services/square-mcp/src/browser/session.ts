import { chromium, type BrowserContext, type Page } from "playwright";

const BROWSER_DATA_DIR = process.env.BROWSER_DATA_DIR ?? "/app/.browser-data";
const SQUARE_BUYER_LOGIN_URL = "https://app.squareup.com/login?app=appointments";

// Single browser instance for the entire process lifetime.
// launchPersistentContext saves cookies/localStorage to BROWSER_DATA_DIR,
// so login sessions survive even if the process restarts.
let browserReady: Promise<{ context: BrowserContext; page: Page }> | null = null;

function launchBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  return (async () => {
    console.error("[browser] launching persistent context...");
    const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    const page = context.pages()[0] ?? (await context.newPage());
    console.error("[browser] ready");
    return { context, page };
  })();
}

export async function getBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  if (!browserReady) {
    browserReady = launchBrowser();
  }

  const { context, page } = await browserReady;

  // If the page was somehow closed, open a new one on the same context
  if (page.isClosed()) {
    const newPage = await context.newPage();
    browserReady = Promise.resolve({ context, page: newPage });
    return { context, page: newPage };
  }

  return { context, page };
}

export async function checkSession(): Promise<boolean> {
  const { page } = await getBrowser();
  try {
    await page.goto(SQUARE_BUYER_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    const url = page.url();
    // If we got redirected away from login, we're authenticated
    if (!url.includes("/login")) return true;
    // If still on login page, check if it's asking for phone (not logged in)
    // vs showing account info (logged in)
    const phoneInput = page.locator('input[type="tel"]:visible');
    if ((await phoneInput.count()) > 0) return false;
    return true;
  } catch {
    return false;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserReady) {
    try {
      const { context } = await browserReady;
      await context.close();
    } catch {}
    browserReady = null;
    console.error("[browser] closed");
  }
}
