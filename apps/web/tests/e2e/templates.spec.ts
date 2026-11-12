import { test, expect, type Page } from '@playwright/test';
import { ContractsResponse } from '@breakrecords/contract';

// Contract templates on sample data: the sample label's templates are its own, so it edits their
// wording (each save a new version) and has nothing to copy.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));

test('editing a template’s wording saves a new version and keeps the old one', async ({ page }) => {
  await page.goto('/contracts/templates/producer');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  await expect(page.getByText('Your template · v3 · points')).toBeVisible();
  await expect(page.getByRole('note')).toHaveCount(0); // its own wording, no starter warning
  await expect(page.getByRole('button', { name: 'Make my own copy' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit wording' }).click();
  const form = page.getByRole('form', { name: 'Edit wording' });
  await form.getByRole('button', { name: 'Add a clause' }).click();
  const added = form.getByRole('group').last();
  await form.getByRole('button', { name: 'Save as a new version' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Not saved.' })).toContainText('Every clause needs a title and its wording');
  await added.getByLabel('Title').fill('Credit');
  await added.getByLabel('Wording').fill('Producer is credited as “Produced by” on every release of the master.');
  await form.getByRole('button', { name: 'Save as a new version' }).click();
  await expect(page.getByRole('status')).toContainText('Saved as a new version');
  await expect(page.getByText('Your template · v4 · points')).toBeVisible();
  await expect(page.locator('dl')).toContainText('Produced by');
  const t = ContractsResponse.parse(await (await page.request.get('/api/contracts')).json()).templates.find((x) => x.id === 'producer')!;
  expect(t.history.map((h) => h.version)).toEqual(['v4 · points', 'v3 · points']);
  expect((await page.request.post('/api/contracts/templates/producer/copy')).status()).toBe(409);
  expect((await page.request.put('/api/contracts/templates/producer', { data: { summary: 'x', clauses: [], playbook: [] } })).status()).toBe(400);
});
