import { test, expect, type Page } from '@playwright/test';

// Uploading an asset keeps the file and lists it with a download link (sample data keeps it per session).
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));

test('an uploaded file is listed in Assets and downloads back the same', async ({ page }) => {
  await page.goto('/catalog/assets');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Upload assets' }).click();
  const up = page.getByRole('dialog', { name: 'Upload assets' });
  await expect(up.getByRole('button', { name: /^Upload/ })).toBeDisabled();
  await up.locator('input[type=file]').setInputFiles({ name: 'lyrics-glasshouse.txt', mimeType: 'text/plain', buffer: Buffer.from('Glass walls, glass hours') });
  await expect(up.getByLabel(/lyrics-glasshouse\.txt/)).toHaveValue('lyrics');
  await up.getByRole('button', { name: 'Upload 1 file' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 file uploaded and saved' })).toBeVisible();
  const link = page.getByRole('link', { name: 'Download lyrics-glasshouse.txt' });
  await expect(link).toBeVisible();
  expect(await (await page.request.get((await link.getAttribute('href'))!)).text()).toBe('Glass walls, glass hours');
  expect((await page.request.post('/api/catalog/assets', { data: { name: 'x', kind: 'stems', size: 0 } })).status()).toBe(400);
});

test('Plan is in the sidebar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('link', { name: 'Plan' }).click();
  await expect(page).toHaveURL(/\/plan$/);
});
