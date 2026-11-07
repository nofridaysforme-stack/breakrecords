import { test, type Page } from '@playwright/test';

type Frame = {
  id: string;
  route: string;
  width: number;
  height: number;
  /** Optional setup before the shot, for example selecting two rows for 2d. */
  prepare?: (page: Page) => Promise<void>;
  /** Setup that must happen before loading the route (it navigates elsewhere first). */
  before?: (page: Page) => Promise<void>;
};

/**
 * Saves artifacts/screens/{id}.png for side-by-side review with
 * design/screenshots/{id}-*.png. Each run starts with a clean session.
 */
export function frame({ id, route, width, height, prepare, before }: Frame) {
  test(`frame ${id}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    if (before) await before(page);
    else {
      await page.goto(route);
      await page.evaluate(() => sessionStorage.clear());
    }
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    if (prepare) await prepare(page);
    await page.screenshot({ path: `artifacts/screens/${id}.png`, fullPage: true });
  });
}
