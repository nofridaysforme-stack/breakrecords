import { test, expect, type Page } from '@playwright/test';
import { RegistrationsResponse } from '@breakrecords/contract';

// The registrations grid: a cell opens a panel; a filing is prepared (an approval card), approved,
// recorded as submitted, then confirmed with its number. Nothing skips a step.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));
const regs = async (page: Page) => RegistrationsResponse.parse(await (await page.request.get('/api/rights/registrations')).json());
const COPYRIGHT = 4;

test('prepare, approve, submit and confirm a registration from the grid', async ({ page }) => {
  await page.goto('/rights/registrations');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  const cell = () => page.getByRole('button', { name: /^Copyright US Office for Glasshouse/ });
  await expect(cell()).toContainText('Not started');
  await cell().click();
  const panel = page.getByRole('dialog', { name: 'Copyright (US Office)' });
  await expect(panel).toContainText('Recording: Glasshouse');
  await panel.getByRole('button', { name: 'Prepare filing' }).click();
  await expect(panel.getByRole('status')).toContainText('Filing prepared');
  const c = (await regs(page)).rows.find((r) => r.id === 'glasshouse')!.cells[COPYRIGHT];
  expect(c).toMatchObject({ status: 'needsYou', label: 'Waiting on your approval', next: 'approve', approvalId: 'reg_copyright_glasshouse' });

  // Recording it submitted before the card is approved is refused.
  const early = await page.request.post('/api/rights/registrations', { data: { action: 'submitted', org: 'copyright', subject: 'recording', id: 'glasshouse', on: '2026-11-18' } });
  expect(early.status()).toBe(409);
  expect((await early.json()).message).toMatch(/Approve the filing first/);

  // The card lists the facts to confirm; approving it makes the registration ready to submit.
  await page.goto('/approvals/reg_copyright_glasshouse');
  await expect(page.getByText("Glasshouse hasn't been registered with the Copyright Office before.")).toBeVisible();
  expect((await page.request.post('/api/approvals/reg_copyright_glasshouse/decision', { data: { action: 'approve' } })).status()).toBe(200);
  await page.goto('/rights/registrations');
  await cell().click();
  await expect(panel).toContainText('Approved, ready to submit');
  await panel.getByLabel(/Their reference/).fill('Case 1-1234567890');
  await panel.getByRole('button', { name: 'I submitted it' }).click();
  await expect(panel.getByRole('status')).toContainText('Recorded as submitted');
  await expect(panel).toContainText('Case 1-1234567890');
  await panel.getByLabel('Registration number').fill('SR 1-9999');
  await panel.getByRole('button', { name: 'Record the confirmation' }).click();
  await expect(panel.getByRole('status')).toContainText('Confirmation recorded.');
  expect((await regs(page)).rows.find((r) => r.id === 'glasshouse')!.cells[COPYRIGHT]).toMatchObject({ status: 'confirmed', ref: 'SR 1-9999', submitRef: 'Case 1-1234567890', next: null });
  // Confirmed is final.
  expect((await page.request.post('/api/rights/registrations', { data: { action: 'prepare', org: 'copyright', subject: 'recording', id: 'glasshouse' } })).status()).toBe(409);
});

test('a song registers with its PRO and The MLC, a recording with the rest; bad requests are refused', async ({ page }) => {
  expect((await page.request.post('/api/rights/registrations', { data: { action: 'prepare', org: 'mlc', subject: 'recording', id: 'glasshouse' } })).status()).toBe(400);
  expect((await page.request.post('/api/rights/registrations', { data: { action: 'prepare', org: 'mlc', subject: 'work', id: 'nope' } })).status()).toBe(404);
  expect((await page.request.post('/api/rights/registrations', { data: { action: 'confirmed', org: 'pro', subject: 'work', id: 'glasshouse', reference: '' } })).status()).toBe(400);
  // The sample MLC filing card already covers Night Bus; a second one is refused.
  const nb = (await regs(page)).rows.find((r) => r.id === 'night-bus')!.cells[1];
  expect(nb).toMatchObject({ next: 'approve', approvalId: 'apr_mlc', target: { subject: 'work', id: 'night-bus' } });
  expect((await page.request.post('/api/rights/registrations', { data: { action: 'prepare', org: 'mlc', subject: 'work', id: 'night-bus' } })).status()).toBe(409);
});
