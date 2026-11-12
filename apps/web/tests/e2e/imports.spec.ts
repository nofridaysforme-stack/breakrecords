import { test, expect, type Page } from '@playwright/test';
import { ImportPreviewResponse, ImportsResponse } from '@breakrecords/contract';

// Importing a distributor's export on sample data: columns guessed and checked, one statement
// per month, catalog ISRCs matched, rows that can't be read left out, and a file only once.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same flow; run once'));

const FILE = [
  'Reporting Date,Sale Month,Store,Artist,Title,ISRC,Quantity,Country of Sale,Earnings (USD)',
  '2026-11-30,2026-10,Spotify,Kesi Vale,Glasshouse,USNL12600014,1000,US,3.912345',
  '2026-11-30,2026-10,Apple Music,Kesi Vale,Glasshouse,US-NL1-26-00014,200,GB,1.50',
  '2026-11-30,2026-10,Spotify,Someone,Unknown Song,QZABC2600001,10,DE,0.04',
  '2026-11-30,2026-09,Spotify,Kesi Vale,Glasshouse,USNL12600014,900,US,3.10',
  '2026-11-30,2026-09,Spotify,Kesi Vale,Glasshouse,USNL12600014,1,US,n/a',
].join('\n');

test('import a DistroKid-style export: check the columns, see each month, import once', async ({ page }) => {
  await page.goto('/money/royalties');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'Import a statement' }).click();
  await expect(page.getByRole('heading', { name: 'Import a statement', level: 1 })).toBeVisible();
  await page.getByLabel('From').selectOption('distrokid');
  await page.getByLabel(/Statement file/).setInputFiles({ name: 'distrokid-oct.csv', mimeType: 'text/csv', buffer: Buffer.from(FILE) });

  await expect(page.getByRole('heading', { name: 'Columns in distrokid-oct.csv' })).toBeVisible();
  await expect(page.getByLabel('Amount earned (needed)')).toHaveValue('Earnings (USD)');
  await expect(page.getByLabel('Month (needed)')).toHaveValue('Sale Month');
  const months = page.getByRole('region', { name: 'Statements by month' });
  await expect(months.getByRole('row')).toHaveCount(3);
  await expect(months).toContainText('September 2026');
  await expect(page.getByText('Row 6: “n/a” isn’t an amount')).toBeVisible();

  // Unmapping the amount stops the import until it's chosen again.
  await page.getByLabel('Amount earned (needed)').selectOption('');
  await expect(page.getByText('Choose the column for amount earned to import.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Import/ })).toBeDisabled();
  await page.getByLabel('Amount earned (needed)').selectOption('Earnings (USD)');

  await page.getByRole('button', { name: 'Import 2 statements' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Imported 2 statements' })).toBeVisible();
  const list = ImportsResponse.parse(await (await page.request.get('/api/money/imports')).json());
  expect(list.items.map((i) => [i.provider, i.period, i.lines, i.matched, i.total])).toEqual([['DistroKid', 'October 2026', 3, 2, 545], ['DistroKid', 'September 2026', 1, 1, 310]]);
  expect(list.items[0].ref).toMatch(/^DK-2026-10-[0-9A-F]{6}$/);

  // The same file again is caught before anything is counted twice.
  const again = ImportPreviewResponse.parse(await (await page.request.post('/api/money/imports/preview', { data: { provider: 'distrokid', fileName: 'copy.csv', text: FILE } })).json());
  expect(again.duplicate).toBe(true);
  const refused = await page.request.post('/api/money/imports', { data: { provider: 'distrokid', fileName: 'copy.csv', text: FILE, mapping: again.mapping } });
  expect(refused.status()).toBe(409);
});

test('a file without readable columns is refused, with the reason', async ({ request }) => {
  const res = await request.post('/api/money/imports', { data: { provider: 'other', fileName: 'x.csv', text: 'a,b\n1,2', mapping: {} } });
  expect(res.status()).toBe(400);
  expect((await res.json()).message).toBe('Choose the column for: track title, amount earned, month.');
});
