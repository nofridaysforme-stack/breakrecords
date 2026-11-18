import { test, expect, type Page } from '@playwright/test';
import { UnclaimedResponse } from '@breakrecords/contract';

// Unclaimed money: each claim is a filing card; after approval it's submitted, then paid or not ours.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));
const unclaimed = async (page: Page) => UnclaimedResponse.parse(await (await page.request.get('/api/rights/unclaimed')).json());

test('a claim is prepared as a card, approved, submitted and paid; the total counts only open claims', async ({ page }) => {
  await page.goto('/rights/unclaimed');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  expect((await unclaimed(page)).total).toBe(31240);
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: /Artist and owner royalties for "Night Bus"/ }) });
  await card.getByText('How to claim it').click();
  await expect(card).toContainText('Search the recording by ISRC and claim it');
  await card.getByRole('button', { name: 'Prepare claim' }).click();
  await expect(card.getByRole('status')).toContainText('Claim prepared');
  const sx = (await unclaimed(page)).items.find((i) => i.id === 'unc_sx')!;
  expect(sx).toMatchObject({ label: 'Waiting on your approval', next: 'approve', approvalId: 'claim_unc_sx' });
  expect((await page.request.post('/api/rights/unclaimed', { data: { action: 'submitted', id: 'unc_sx', on: '2026-11-18' } })).status()).toBe(409);
  await page.goto('/approvals/claim_unc_sx');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('the claim for $198.60 is ready to submit to SoundExchange');
  expect((await page.request.post('/api/approvals/claim_unc_sx/decision', { data: { action: 'approve' } })).status()).toBe(200);

  await page.goto('/rights/unclaimed');
  await card.getByLabel('Their reference').fill('SX-CLM-88');
  await card.getByRole('button', { name: 'I submitted the claim' }).click();
  await expect(card.getByRole('status')).toContainText('Recorded as submitted');
  await card.getByLabel('Amount received ($)').fill('196.40');
  await card.getByRole('button', { name: 'Record the payment' }).click();
  await expect(card.getByRole('status')).toContainText('Payment recorded');
  const after = await unclaimed(page);
  expect(after.items.find((i) => i.id === 'unc_sx')).toMatchObject({ label: 'Paid', next: null, paid: 19640, submitRef: 'SX-CLM-88' });
  expect(after.total).toBe(11380); // only the MLC money is still open
  expect((await page.request.post('/api/rights/unclaimed', { data: { action: 'prepare', id: 'unc_sx' } })).status()).toBe(409); // closed
});

test('money that isn’t ours is closed with a reason; bad requests are refused', async ({ page }) => {
  expect((await page.request.post('/api/rights/unclaimed', { data: { action: 'dismissed', id: 'unc_mlc', reason: ' ' } })).status()).toBe(400);
  expect((await page.request.post('/api/rights/unclaimed', { data: { action: 'paid', id: 'unc_mlc', amount: 100 } })).status()).toBe(409);
  expect((await page.request.post('/api/rights/unclaimed', { data: { action: 'prepare', id: 'nope' } })).status()).toBe(404);
  const res = await page.request.post('/api/rights/unclaimed', { data: { action: 'dismissed', id: 'unc_mlc', reason: 'A different song with the same title' } });
  expect(res.status()).toBe(200);
  expect(UnclaimedResponse.parse(await res.json()).items.find((i) => i.id === 'unc_mlc')).toMatchObject({ label: 'Not ours', resolution: 'A different song with the same title' });
});

test('money found in a society’s own search is added by hand, then claimed like any other', async ({ page }) => {
  await page.goto('/rights/unclaimed');
  await page.waitForLoadState('networkidle');
  const look = page.getByRole('region', { name: 'Where to look' });
  await expect(look.getByRole('link', { name: /The MLC artist lookup/ })).toHaveAttribute('href', 'https://durp.themlc.com/artist-lookup');
  await expect(look.getByRole('link', { name: /SoundExchange/ })).toHaveAttribute('target', '_blank');
  const add = page.getByRole('region', { name: 'Add money you found' });
  await expect(add.getByRole('button', { name: 'Add to the list' })).toBeDisabled();
  await add.getByLabel('Where you found it').selectOption('mlc');
  await add.getByLabel('Song or recording').fill('Paper Moons');
  await add.getByLabel('Amount shown ($)').fill('42.15');
  await add.getByLabel(/Held since/).fill('2026-03-01');
  await add.getByRole('button', { name: 'Add to the list' }).click();
  await expect(add.getByRole('status')).toContainText('Added to the list');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Paper Moons' }) });
  await expect(card).toContainText('You found this in The MLC’s search.');
  await expect(card).toContainText('Mar 2026');
  const again = await page.request.post('/api/rights/unclaimed', { data: { action: 'add', source: 'mlc', what: 'paper moons', amount: 4215, heldSince: '2026-03-01' } });
  expect(again.status()).toBe(409);
  expect((await page.request.post('/api/rights/unclaimed', { data: { action: 'add', source: 'mlc', what: 'x', amount: 0, heldSince: '2026-03-01' } })).status()).toBe(400);
  await card.getByRole('button', { name: 'Prepare claim' }).click();
  await expect(card.getByRole('status')).toContainText('Claim prepared');
  const item = (await unclaimed(page)).items.find((i) => i.what === 'Paper Moons')!;
  expect(item).toMatchObject({ source: 'MLC', amount: 4215, next: 'approve' });
});
