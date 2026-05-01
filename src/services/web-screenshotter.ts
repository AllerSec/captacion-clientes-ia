import puppeteer, { Browser } from 'puppeteer';
import { logger } from '../lib/logger.js';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

export interface ScreenshotResult {
  base64: string | null;
  error?: string;
}

export async function captureScreenshot(url: string, opts: { timeoutMs?: number } = {}): Promise<ScreenshotResult> {
  const log = logger.child({ component: 'screenshotter' });
  const timeout = opts.timeoutMs ?? 15000;
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (compatible; LeadAnalyzer/1.0)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    const buf = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
    return { base64: Buffer.from(buf).toString('base64') };
  } catch (err) {
    log.warn({ err: (err as Error).message, url }, 'screenshot failed');
    return { base64: null, error: (err as Error).message };
  } finally {
    if (page) await page.close().catch(() => undefined);
  }
}
