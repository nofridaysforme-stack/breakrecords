import { test, expect, type Page } from '@playwright/test';

// The P2 screen fixes on sample data: releases live in Catalog, the grant's full answers are
// edited and saved on its card, and amounts are read once.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

test('in-progress releases sit at the top of Catalog › Releases, and the old address goes there', async ({ page }) => {
  await page.goto('/releases');
  await expect(page).toHaveURL(/\/catalog\/releases/);
  const prog = page.getByRole('region', { name: 'In progress' }).or(page.locator('#in-progress')).first();
  await expect(prog.getByRole('link', { name: /Glasshouse/ })).toBeVisible();
  await prog.getByRole('link', { name: /Glasshouse/ }).click();
  await expect(page).toHaveURL(/\/releases\/rel_glasshouse/);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Catalog / Releases');
  if (!isPhone(page)) {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Releases' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Catalog' })).toHaveAttribute('aria-current', 'page');
  }
});

test('the grant card shows its full answers, edits them in place, and saves before approving', async ({ page }) => {
  test.skip(isPhone(page), 'Same server; run once');
  await page.goto('/approvals/apr_grant');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  const summary = page.getByLabel('Project summary');
  await expect(summary).toHaveValue(/free all-ages release show\.$/);
  await expect(page.getByRole('button', { name: 'Edit then approve' })).toHaveCount(0);
  await summary.fill('A shorter summary for the panel.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved. This wording is what you approve.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Project summary')).toHaveValue('A shorter summary for the panel.');
  expect((await page.request.put('/api/approvals/apr_grant/draft', { data: { values: ['x'.repeat(1501), 'y'] } })).status()).toBe(400);
  expect((await page.request.put('/api/approvals/apr_payout_oct/draft', { data: { values: ['x'] } })).status()).toBe(400);
});
