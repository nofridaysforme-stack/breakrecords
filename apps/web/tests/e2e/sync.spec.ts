import { test, expect, type Page } from '@playwright/test';
import { SyncResponse } from '@breakrecords/contract';

// Sync licensing on sample data: a brief, a quote for one recording, the license as a signature
// card, and the fee recorded only once it's signed.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));
const sync = async (page: Page) => SyncResponse.parse(await (await page.request.get('/api/sync')).json());

test('a brief, a quote, the license signed in Approvals, then the fee recorded', async ({ page }) => {
  await page.goto('/contracts');
  await page.getByRole('link', { name: 'Sync licensing' }).click();
  await expect(page.getByRole('heading', { name: 'Sync licensing', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved

  await page.getByLabel('What it’s for').fill('Closing credits, indie feature');
  await page.getByLabel('Client').fill('Harbor Pictures');
  await page.getByLabel('Media', { exact: true }).selectOption('film');
  await page.getByLabel('Budget, if they gave one ($)').fill('8000');
  await page.getByRole('button', { name: 'Add brief' }).click();
  await expect(page.getByRole('status')).toContainText('Brief “Closing credits, indie feature” added.');

  const brief = page.getByRole('region', { name: 'Closing credits, indie feature', exact: true });
  await brief.getByRole('button', { name: 'Offer a recording' }).click();
  await brief.getByLabel('Recording', { exact: true }).selectOption('night-bus');
  await expect(brief.getByRole('link', { name: 'One-sheet' })).toBeVisible();
  await brief.getByLabel('Fee ($)').fill('7500.01');
  await brief.getByLabel('The use').fill('Closing credits, 90 seconds');
  await brief.getByRole('button', { name: 'Add quote' }).click();
  // Half each: the master is rounded, the song gets the rest.
  const row = brief.getByRole('row', { name: /Night Bus/ });
  await expect(row).toContainText('$3,750.01');
  await expect(row).toContainText('$3,750.00');

  await brief.getByRole('button', { name: 'Mark sent' }).click();
  await brief.getByRole('button', { name: 'Client accepted' }).click();
  await expect(brief).toContainText('Accepted: sign in Approvals');
  const q = (await sync(page)).briefs[0].quotes[0];
  expect(q).toMatchObject({ state: 'awaiting_signature', fee: 750001, master: 375001, song: 375000, approvalId: expect.stringMatching(/^sync_/) });

  // Recording the fee before the license is signed is refused.
  expect((await page.request.post(`/api/sync/quotes/${q.id}`, { data: { action: 'paid' } })).status()).toBe(409);
  await page.goto(`/sync/license/${q.id}`);
  await expect(page.getByRole('note')).toContainText('DRAFT');
  await expect(page.getByRole('article', { name: 'License text' })).toContainText('Harbor Pictures');

  expect((await page.request.post(`/api/approvals/${q.approvalId}/decision`, { data: { action: 'approve' } })).status()).toBe(200);
  await page.goto('/sync');
  await page.getByRole('region', { name: 'Closing credits, indie feature', exact: true }).getByRole('button', { name: 'Fee received' }).click();
  await expect(page.getByRole('status')).toContainText('Fee recorded as sync income');
  expect((await sync(page)).briefs[0].quotes[0]).toMatchObject({ state: 'paid', paidRef: expect.stringMatching(/^SYNC-/) });
  // A decided quote can't be decided again.
  expect((await page.request.post(`/api/sync/quotes/${q.id}`, { data: { action: 'decline' } })).status()).toBe(409);
});

test('bad input is refused with a reason, and the one-sheet shows what a supervisor needs', async ({ page }) => {
  expect((await page.request.post('/api/sync/briefs', { data: { title: ' ', client: 'X', media: 'film' } })).status()).toBe(400);
  expect((await page.request.post('/api/sync/briefs', { data: { title: 'Ad spot', client: 'Brand Co', media: 'ad' } })).status()).toBe(200);
  const id = (await sync(page)).briefs[0].id;
  expect((await page.request.post(`/api/sync/briefs/${id}/quotes`, { data: { recordingId: 'night-bus', fee: 0, use: 'x' } })).status()).toBe(400);
  expect((await page.request.post(`/api/sync/briefs/${id}/quotes`, { data: { recordingId: 'nope', fee: 100, use: 'x' } })).status()).toBe(404);
  expect((await page.request.post(`/api/sync/briefs/${id}/quotes`, { data: { recordingId: 'night-bus', fee: 100, masterBp: 10001, use: 'x' } })).status()).toBe(400);
  await page.goto('/sync/one-sheet/night-bus');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Night Bus');
  await expect(page.locator('main')).toContainText('ISRC');
});
