// P14: Automated accessibility audit for the control-room UI.
//
// Runs axe-core against both popup.html and options.html after rendering.
// Catches contrast failures, missing ARIA labels, and focus-management
// regressions before they ship to users who rely on assistive tech.
//
// Requires: playwright-axe, axe-core
// Run with: npx playwright test --project=chromium-extension tests/e2e/a11y.spec.js
import { test, expect } from '@Playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Accessibility audit', () => {
  test('popup.html has no a11y violations', async ({ page }) => {
    await page.goto('chrome-extension://[EXTENSION_ID]/popup/popup.html');
    await injectAxe(page);
    // Wait for the dynamic DOM to settle before scanning.
    await page.waitForTimeout(500);
    await checkA11y(page, null, {
      detailedReport: true,
      a11yOnly: true,
      // P14: these are the checks AGENTS.md §5 prescribes.
      rules: {
        'color-contrast': { enabled: true },
        'aria-label': { enabled: true },
        'aria-required-children': { enabled: true },
        'aria-required-parent': { enabled: true },
        'aria-roles': { enabled: true },
        'image-alt': { enabled: true },
        label: { enabled: true },
        // SVG ring progress and switch tracks must carry ARIA attributes.
        'aria-allowed-attr': { enabled: true },
        'aria-valid-attr': { enabled: true },
      },
    });
  });

  test('options.html has no a11y violations', async ({ page }) => {
    await page.goto('chrome-extension://[EXTENSION_ID]/options/options.html');
    await injectAxe(page);
    await page.waitForTimeout(1000);
    // The options page renders tabs and dynamic content; scan both.
    await checkA11y(page, 'tab-content', {
      detailedReport: true,
      a11yOnly: true,
      rules: {
        'color-contrast': { enabled: true },
        'aria-label': { enabled: true },
        'focus-order-semantics': { enabled: true },
        'scrollable-region-focusable': { enabled: true },
      },
    });
    await checkA11y(page, 'options-form', {
      detailedReport: true,
      a11yOnly: true,
      rules: {
        'color-contrast': { enabled: true },
        'aria-label': { enabled: true },
        label: { enabled: true },
      },
    });
  });
});
