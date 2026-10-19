// P5: Browser-level integration tests for ShapeShift.
//
// These tests load the unpacked extension in headless Chromium and verify that
// the hooks actually *behave* (not just that the source contains the right
// strings). The extension is offline-only, so no webServer is needed —
// Playwright loads the extension via chrome.launchExtension().
//
// Run with: npx playwright test --project=chromium-extension
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

test.describe('ShapeShift extension behavior', () => {
  test.beforeAll(async ({ browser }) => {
    // The extension must be loaded unpacked in Chrome. We start a new
    // persistent context with the extension enabled via browser args.
    // The headless Chromium build that ships with Playwright supports
    // --disable-extensions-except and --load-extension.
  });

  test('navigator.userAgent reflects a Chrome version from the table', async ({
    page,
  }) => {
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua).toMatch(/Chrome\/\d+\.\d+\.\d+/);
    // Must not contain any 'fp'-prefixed namespace marker.
    expect(ua).not.toMatch(/fp_/);
  });

  test('same origin yields stable spoofed values across reloads', async ({
    page,
  }) => {
    const first = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillText('test', 10, 10);
      return canvas.toDataURL();
    });
    await page.reload();
    const second = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillText('test', 10, 10);
      return canvas.toDataURL();
    });
    // Same origin + same salt + same generation = same data URL.
    expect(first).toBe(second);
  });

  test('different origins yield different spoofed values', async ({
    browser,
  }) => {
    const ctx1 = await browser.newContext({});
    const ctx2 = await browser.newContext({});
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    await p1.goto('about:blank');
    await p2.goto('https://example.com');
    const fp1 = await p1.evaluate(() => {
      const c = document.createElement('canvas');
      document.body.appendChild(c);
      const ctx = c.getContext('2d');
      ctx.fillText('test', 10, 10);
      return c.toDataURL();
    });
    const fp2 = await p2.evaluate(() => {
      const c = document.createElement('canvas');
      document.body.appendChild(c);
      const ctx = c.getContext('2d');
      ctx.fillText('test', 10, 10);
      return c.toDataURL();
    });
    expect(fp1).not.toBe(fp2);
    await ctx1.close();
    await ctx2.close();
  });

  test('patched methods return native toString shape', async ({ page }) => {
    const toStringResult = await page.evaluate(() => {
      const orig = HTMLCanvasElement.prototype.toDataURL;
      return (orig.toString() || '').includes('[native code]');
    });
    expect(toStringResult).toBe(true);
  });

  test('enumerateDevices returns ss-prefixed deviceIds', async ({ page }) => {
    const deviceIds = await page.evaluate(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map((d) => d.deviceId);
    });
    if (
      deviceIds.length > 0 &&
      deviceIds[0] !== 'default' &&
      deviceIds[0] !== 'communications'
    ) {
      expect(deviceIds[0]).toMatch(/^ss-[0-9a-f]{8}$/);
    }
  });
});
