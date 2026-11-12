import { test, expect, type Page } from '@playwright/test';
import { ApprovalChecksResponse, PayoutsResponse, ReservesResponse, StatementResponse } from '@breakrecords/contract';

// Reserves on sample data: a flag holds a recording's income from unpaid batches, statements
// and Home show it, releasing needs an approval, and artificial streams are forfeited.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));

test('flagging a recording holds its share of every unpaid line, and ROY-07 passes because it’s held', async ({ page }) => {
  await page.goto('/money/payouts');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  const reserves = page.getByRole('region', { name: 'Reserves' }).or(page.locator('#reserves')).first();
  await reserves.getByRole('button', { name: 'Flag a recording' }).click();
  await reserves.getByLabel('Recording').selectOption('night-bus');
  await reserves.getByLabel('Why it’s flagged').fill('unusual stream spike on Nov 9');
  await reserves.getByRole('button', { name: 'Flag and hold income' }).click();
  await expect(reserves).toContainText(/\$5,251\.83.* held from unpaid batches\./); // the October batch and the Q4 artist run

  const p = PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json());
  expect(p.batches.filter((b) => b.held).map((b) => [b.id, b.held])).toEqual([['pb-2026-10', 69443], ['pb-2026-q3', 455740]]);
  const c = ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
  expect(c.items.apr_payout_oct.results.find((r) => r.id === 'ROY-07')).toMatchObject({
    status: 'pass', message: 'Night Bus has an open audit flag. $694.43 of this batch is held in reserve until it’s resolved.',
  });
  // Home's Needs you lists it (AUD-02); flagging it twice is refused.
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Income held by audit flags' })).toContainText('Night Bus is flagged: unusual stream spike on Nov 9.');
  expect((await page.request.post('/api/money/reserves', { data: { recordingId: 'night-bus', note: 'again' } })).status()).toBe(409);
});

test('a statement shows the part held; real listeners release it only once the card is approved', async ({ page }) => {
  expect((await page.request.post('/api/money/reserves', { data: { recordingId: 'paper-moons', note: 'spike' } })).status()).toBe(200);
  const st = StatementResponse.parse(await (await page.request.get('/api/statements/ST-2026-10-MD')).json());
  expect(st.held).toEqual({ amount: 1158, note: '$11.58 held in reserve while Paper Moons is checked for artificial streams.' });
  await page.goto('/money/statements/ST-2026-10-MD');
  await expect(page.getByRole('note')).toContainText(/\$11\.58.* held\. In reserve while Paper Moons/);

  await page.goto('/money/payouts');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  const reserves = page.locator('#reserves');
  await reserves.getByRole('button', { name: 'Real listeners: release Paper Moons' }).click();
  await reserves.getByLabel('What showed the streams are real?').fill('Distributor report: a radio feature');
  await reserves.getByRole('button', { name: 'Ask to release' }).click();
  await expect(reserves).toContainText('Release waiting on approval');
  const r = ReservesResponse.parse(await (await page.request.get('/api/money/reserves')).json());
  const item = r.items.find((x) => x.recordingId === 'paper-moons')!;
  expect(item).toMatchObject({ status: 'releasing', approvalId: expect.stringMatching(/^reserve_/) });
  expect(item.heldNow).toBeGreaterThan(0); // still held until approved

  expect((await page.request.post(`/api/approvals/${item.approvalId}/decision`, { data: { action: 'approve' } })).status()).toBe(200);
  const after = ReservesResponse.parse(await (await page.request.get('/api/money/reserves')).json()).items.find((x) => x.id === item.id)!;
  expect(after).toMatchObject({ status: 'released', heldNow: 0 });
  expect(StatementResponse.parse(await (await page.request.get('/api/statements/ST-2026-10-MD')).json()).held).toBeUndefined();
});

test('artificial streams forfeit the income, a reason is required, and a decided flag can’t change', async ({ page }) => {
  await page.request.post('/api/money/reserves', { data: { recordingId: 'night-bus', note: 'spike' } });
  const id = ReservesResponse.parse(await (await page.request.get('/api/money/reserves')).json()).items[0].id;
  expect((await page.request.post(`/api/money/reserves/${id}/resolve`, { data: { outcome: 'forfeit', note: ' ' } })).status()).toBe(400);
  expect((await page.request.post(`/api/money/reserves/${id}/resolve`, { data: { outcome: 'forfeit', note: 'Bot farm confirmed' } })).status()).toBe(200);
  const r = ReservesResponse.parse(await (await page.request.get('/api/money/reserves')).json());
  expect(r.items[0]).toMatchObject({ status: 'forfeited', heldNow: 0, outcomeNote: 'Bot farm confirmed' });
  expect((await page.request.post(`/api/money/reserves/${id}/resolve`, { data: { outcome: 'release', note: 'oops' } })).status()).toBe(409);
});
