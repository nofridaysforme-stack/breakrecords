import { test, expect } from '@playwright/test';

// No page may scroll sideways at any width (CLAUDE_CODE_INSTRUCTIONS: works at phone width).
for (const path of ['/', '/approvals', '/dev/type', '/dev/components']) {
  test(`no horizontal page scroll on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(scroll).toBeLessThanOrEqual(width);
  });
}
