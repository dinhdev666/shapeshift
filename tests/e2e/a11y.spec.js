// P14: Automated accessibility audit for the control-room UI.
//
// Runs axe-core against both popup.html and options.html after rendering.
// Catches contrast failures, missing ARIA labels, and focus-management
// regressions before they ship to users who rely on assistive tech.
//
// The audit is scoped with `runOnly` to the rules AGENTS.md §5 prescribes.
// Without that scope axe also runs its structural landmark rules
// (`region`, `landmark-one-main`), which fire on every card inside the popup
// and turn a style regression into a flood of unrelated failures.
//
// Requires: axe-playwright, axe-core
// Run with: npx playwright test --project=chromium-extension tests/e2e/a11y.spec.js
import { test, expect } from './fixtures.js';
import { injectAxe } from 'axe-playwright';

// Rule ids must exist in the installed axe-core: `runOnly.values` throws on an
// unknown id (there is no `aria-label` rule — accessible names are covered by
// the per-widget `*-name` rules).
const RULES = [
  'color-contrast',
  'aria-input-field-name',
  'aria-toggle-field-name',
  'aria-command-name',
  'button-name',
  'link-name',
  'aria-required-attr',
  'aria-required-children',
  'aria-required-parent',
  'aria-roles',
  'aria-allowed-attr',
  'aria-valid-attr',
  'aria-valid-attr-value',
  'image-alt',
  'label',
  'focus-order-semantics',
  'scrollable-region-focusable',
];

// Runs axe on the whole document and formats the violations compactly so a CI
// log names the offending node without dumping axe's full JSON report.
async function audit(page) {
  await injectAxe(page);
  const result = await page.evaluate(
    async (rules) =>
      window.axe.run(document, {
        runOnly: { type: 'rule', values: rules },
        resultTypes: ['violations'],
      }),
    RULES
  );
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));
}

test.describe('Accessibility audit', () => {
  test('popup.html has no a11y violations', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    // Wait for the dynamic DOM to settle before scanning.
    await page.waitForTimeout(500);
    const violations = await audit(page);
    expect(JSON.stringify(violations, null, 2)).toBe('[]');
  });

  test('options.html has no a11y violations', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    // The options page renders rows and counters after the config loads.
    await page.waitForTimeout(1000);
    const violations = await audit(page);
    expect(JSON.stringify(violations, null, 2)).toBe('[]');
  });
});
