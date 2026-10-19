// P5 + P14: Playwright e2e configuration for ShapeShift.
//
// Tests run in a headless Chromium with the unpacked extension loaded.
// The extension is offline-only (no fetch/XHR), so no remote test server is
// needed — Playwright's `chrome.launchExtension` handles the local extension
// load directly.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // The extension must be loaded from the repo root (where manifest.json lives).
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-asciidoc',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // headless: false allows the browser to be debugged visually.
        headless: false,
      },
    },
  ],
  // P5: load the extension unpacked on every test run.
  // The path resolves to the repo root which contains manifest.json + dist/.
  // We load from dist/ (the built extension) since that is what the user
  // actually installs.
  webServer: {
    command: 'node scripts/build.mjs',
    cwd: process.cwd(),
    port: 3000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignored',
    stderr: 'ignored',
    timeout: 30_000,
  },
});
