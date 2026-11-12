import { test, expect, type Page } from '@playwright/test';
import { ApprovalChecksResponse, PayeeResponse, PayoutsResponse, TaxYearResponse } from '@breakrecords/contract';

// Tax compliance on sample data: withholding by form, the missing-form choice, year-end forms
// filed through an approval, and a payee certifying their own form.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

test('each payee shows how they’re taxed, and a missing form can pay with 24% withheld instead of holding', async ({ page }) => {
  await page.goto('/money/payouts');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  const tax = page.getByRole('region', { name: 'Tax forms' }).or(page.locator('section[aria-labelledby="tax"]')).filter({ visible: true });
  await expect(tax).toContainText('0% under the GB treaty, Article 12');
  await expect(tax).toContainText('No tax form: payout held');
  await tax.getByLabel('When a form is missing or expired').selectOption('withhold');
  await expect(tax).toContainText('No tax form: 24% backup withholding');
  const p = PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json());
  expect(p.missingFormPolicy).toBe('withhold');
});

test('year-end forms are filed only through an approval: prepare, approve, download, mark filed', async ({ page }) => {
  test.skip(isPhone(page), 'Same flow; run once');
  const year = async () => TaxYearResponse.parse(await (await page.request.get('/api/money/tax/2026')).json());
  const t = await year();
  expect(t.forms1099.map((f) => [f.name, f.royalties, f.reportable])).toEqual([['Ari Monroe', 77012, true], ['Dana Okafor', 43524, true], ['Marco Dela', 86130, true], ['Rue Sato', 43525, true]]);
  expect(t.forms1042s).toEqual([{ payeeId: 'theo-lind', name: 'Theo Lind', country: 'GB', rateBp: 0, gross: 14191, withheld: 0 }]);
  expect(t.filing).toEqual({ status: 'none' });
  expect((await page.request.get('/api/money/tax/2026/csv')).status()).toBe(409); // nothing to download before approval

  await page.goto('/money/tax');
  await page.getByRole('button', { name: 'Prepare 2026 filing' }).click();
  await expect(page.getByText('The 2026 filing is waiting in')).toBeVisible();
  expect((await page.request.post('/api/money/tax/2026/prepare')).status()).toBe(409);
  expect((await page.request.post('/api/money/tax/2026/filed')).status()).toBe(409);

  const c = ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
  expect(c.items.tax_2026.results.map((r) => [r.id, r.status])).toEqual([['TAX-01', 'pass'], ['TAX-02', 'pass']]);
  expect((await page.request.post('/api/approvals/tax_2026/decision', { data: { action: 'approve' } })).status()).toBe(200);

  await page.reload();
  await expect(page.getByText('Approved. Download the file')).toBeVisible();
  const csv = await (await page.request.get('/api/money/tax/2026/csv')).text();
  expect(csv.split('\n')[1]).toBe('1099-MISC,2026,Northline Records,Ari Monroe,***-**-2373 (fill in full),US,2 Royalties,770.12,0.00,0%');
  expect(csv).toContain('1042-S,2026,Northline Records,Theo Lind,Not required,GB,Income code 12 Royalties,141.91,0.00,0%');
  await page.getByRole('button', { name: 'Mark 2026 filed' }).click();
  await expect(page.getByText(/Filed on .*can no longer be undone/)).toBeVisible();
  expect((await year()).filing.status).toBe('filed');
});

test('a payee certifies a W-8BEN with a treaty rate in the portal, and it shows how they’re taxed', async ({ page }) => {
  await page.goto('/portal/tax');
  await page.getByRole('button', { name: 'Submit a new form' }).click();
  await page.getByRole('radio', { name: /W-8BEN You’re a person/ }).check();
  await page.getByLabel('Legal name').fill('Marco Dela');
  await page.getByLabel(/Country of tax residence/).fill('gb');
  await page.getByLabel('I claim a tax treaty rate on royalties').check();
  await page.getByLabel('Treaty article').fill('12');
  await page.getByLabel(/Treaty rate on royalties/).fill('0');
  const submit = page.getByRole('button', { name: 'Sign and submit W-8BEN' });
  await expect(submit).toBeDisabled(); // not signed yet
  await page.getByLabel(/Signature/).fill('Marco Dela');
  await submit.click();
  await expect(page.getByRole('status')).toHaveText('Saved. Northline Records now has your W-8BEN.');
  await expect(page.getByText('0% under the GB treaty, Article 12.')).toBeVisible();
  const p = PayeeResponse.parse(await (await page.request.get('/api/portal/marco-dela')).json());
  expect(p.tax).toMatchObject({ form: 'W-8BEN', expires: 'Expires Dec 31, 2029' });
  // A W-9 needs the last 4 digits; the server refuses it without them.
  const bad = await page.request.post('/api/portal/tax-form', { data: { form: 'W-9', legalName: 'Marco Dela', signature: 'Marco Dela' } });
  expect(bad.status()).toBe(400);
});
