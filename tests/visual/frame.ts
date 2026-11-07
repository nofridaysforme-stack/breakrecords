import { test, type Page } from '@playwright/test';

type Frame = {
  id: string;
  route: string;
  width: number;
  height: number;
  /** Optional setup before the shot, for example selecting two rows for 2d. */
  prepare?: (page: Page) => Promise<void>;
};

/**
 * Saves artifacts/screens/{id}.png for side-by-side review with
 * design/screenshots/{id}-*.png. Each run starts with a clean session.
 */
export function frame({ id, route, width, height, prepare }: Frame) {
  test(`frame ${id}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(route);
    await page.evaluate(() => { sessionStorage.clear(); document.fonts.ready; });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    if (prepare) await prepare(page);
    await page.screenshot({ path: `artifacts/screens/${id}.png`, fullPage: true });
  });
}
