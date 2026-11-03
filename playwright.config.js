// P5 + P14: Playwright e2e configuration for ShapeShift.
//
// The extension is offline-only and ships as an unpacked MV3 build, so there
// is no dev server to wait for: a `webServer` that merely runs the build
// script exits immediately and Playwright reports "Process from config.webServer
// exited early". Each spec instead launches its own persistent Chromium
// context with the unpacked extension loaded (see tests/e2e/fixtures.js).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Persistent browser contexts cannot be shared safely across workers.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // `channel: 'chromium'` selects the new headless mode, which is the
        // only headless mode that can load unpacked extensions.
        channel: 'chromium',
      },
    },
  ],
});
