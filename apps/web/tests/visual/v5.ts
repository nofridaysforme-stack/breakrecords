import type { Page } from '@playwright/test';

/** Fix draft v5 to 100% (label 45%) and send it, so the portal shows the signature request like 4f and 4g. */
export async function sendV5(page: Page) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/splits/gh-rec');
  await page.getByRole('button', { name: 'Edit draft shares' }).click();
  await page.getByLabel('Label, share of net profit').fill('45');
  await page.getByRole('button', { name: 'Send v5 for signatures' }).click();
  if (size) await page.setViewportSize(size);
}
