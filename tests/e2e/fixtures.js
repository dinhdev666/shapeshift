// Playwright fixtures that boot Chromium with the unpacked ShapeShift
// extension installed.
//
// Playwright's default `browser`/`page` fixtures launch a plain browser with
// no extension, so every MV3 test needs its own persistent context. The
// extension id is not stable for an unpacked build, so it is derived from the
// background service worker URL instead of being hard-coded.
import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

export const test = base.extend({
  // Overriding `context` makes the built-in `page` fixture use this
  // extension-enabled context as well.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export { expect };
