// P5: Browser-level integration tests for ShapeShift.
//
// These tests load the unpacked extension (dist/) in Chromium and verify that
// the hooks actually *behave* rather than merely existing in the source. The
// extension is offline-only, so pages are served from route interception on
// fake origins: no network access and no test web server are required.
//
// Run with: npx playwright test --project=chromium-extension
import { test, expect } from './fixtures.js';

const FIXTURE_HTML = '<!doctype html><html><body><p>fixture</p></body></html>';

async function openOrigin(page, origin) {
  await page.route(`${origin}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: FIXTURE_HTML,
    })
  );
  await page.goto(`${origin}/index.html`);
  // ShapeShift installs its MAIN-world hooks asynchronously (salt + KDF).
  // Sampling before they are ready reads the un-hooked canvas and makes the
  // determinism assertions flaky, so wait for the readiness signal first.
  await page.waitForFunction(() => window.__ssHooksReady === true, {
    timeout: 15000,
  });
}

async function canvasFingerprint(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('ShapeShift fingerprint probe', 2, 2);
    return canvas.toDataURL();
  });
}

test.describe('ShapeShift extension behavior', () => {
  test('navigator.userAgent reports a real Chrome version', async ({
    page,
  }) => {
    await openOrigin(page, 'https://ua.test');
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua).toMatch(/Chrome\/\d+\.\d+\.\d+/);
    // Must not leak the extension namespace into the UA string.
    expect(ua).not.toMatch(/ss_/);
  });

  test('same origin yields stable spoofed values across reloads', async ({
    page,
  }) => {
    await openOrigin(page, 'https://stable.test');
    await page.waitForFunction(() => window.__ssHooksReady === true, {
      timeout: 10000,
    });
    const first = await canvasFingerprint(page);
    await page.reload();
    await page.waitForFunction(() => window.__ssHooksReady === true, {
      timeout: 10000,
    });
    const second = await canvasFingerprint(page);
    // Same origin + same salt + same generation = same data URL.
    expect(first).toBe(second);
  });

  test('different origins yield different spoofed values', async ({
    context,
  }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await openOrigin(pageA, 'https://origin-a.test');
    await openOrigin(pageB, 'https://origin-b.test');
    const ssA = await canvasFingerprint(pageA);
    const ssB = await canvasFingerprint(pageB);
    expect(ssA).not.toBe(ssB);
    await pageA.close();
    await pageB.close();
  });

  test('patched methods keep a native toString shape', async ({ page }) => {
    await openOrigin(page, 'https://to-string.test');
    const toStringResult = await page.evaluate(() => {
      const current = HTMLCanvasElement.prototype.toDataURL;
      return (current.toString() || '').includes('[native code]');
    });
    expect(toStringResult).toBe(true);
  });

  test('enumerateDevices returns ss-prefixed deviceIds', async ({ page }) => {
    await openOrigin(page, 'https://devices.test');
    const deviceIds = await page.evaluate(async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map((device) => device.deviceId);
    });
    const spoofed = deviceIds.filter(
      (id) => id !== 'default' && id !== 'communications' && id !== ''
    );
    for (const id of spoofed) expect(id).toMatch(/^ss-[0-9a-f]{8}$/);
  });
});
