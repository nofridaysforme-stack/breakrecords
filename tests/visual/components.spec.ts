import { test } from '@playwright/test';

// Saves screenshots for side-by-side review against design/screenshots.
// Phase C adds one spec per frame id (tests/visual/{id}.spec.ts).
test('component gallery screenshot', async ({ page }, info) => {
  await page.goto('/dev/components');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `artifacts/screens/dev-components-${info.project.name}.png`, fullPage: true });
});
