import { test, expect, type Page } from '@playwright/test';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

test.describe('desktop only', () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), 'Desktop layout'));

  test('v5 cannot be sent until it totals 100%, then the payee can sign it', async ({ page }) => {
    await page.goto('/splits/gh-rec');
    const v5 = page.getByRole('region', { name: /Draft version 5/ });
    await expect(v5.getByRole('status')).toContainText('5% of net profit is unassigned');
    await expect(v5).toContainText('4.85% unassigned');
    const send = page.getByRole('button', { name: 'Send v5 for signatures' });
    await expect(send).toBeDisabled();
    await expect(send).toHaveAccessibleDescription(/Assign the missing 5% of net profit first/);
    await page.getByRole('button', { name: 'Edit draft shares' }).click();
    await page.getByLabel('Label, share of net profit').fill('45');
    await expect(v5).toContainText('Totals 100% · ready to send');
    await expect(page.getByRole('button', { name: /Label 43\.65%/ })).toBeVisible();
    await send.click();
    await expect(page.getByRole('button', { name: 'v5 sent for signatures' })).toBeDisabled();
    await page.goto('/portal');
    await page.getByRole('link', { name: 'Waiting for you to sign' }).click();
    await expect(page.getByRole('heading', { name: 'Glasshouse split v5 needs your signature' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign v5' }).click();
    await expect(page.getByText('You signed v5.')).toBeVisible();
    await page.goto('/portal');
    await expect(page.getByText('signed v5')).toBeVisible();
  });

  test('preview a payout shows who gets what under v4 and v5', async ({ page }) => {
    await page.goto('/splits/gh-rec');
    await page.getByRole('button', { name: 'Preview a payout' }).click();
    const dialog = page.getByRole('dialog', { name: 'Preview a payout' });
    await dialog.getByLabel(/Recording income/).fill('10000');
    await expect(dialog.getByRole('row', { name: /Kesi Vale/ })).toContainText('$4,365.00');
    await expect(dialog.getByRole('row', { name: /Unassigned/ })).toContainText('$485.00');
  });

  test('a node without its own split says what it inherits', async ({ page }) => {
    await page.goto('/splits/gh-song');
    await expect(page.getByRole('heading', { name: 'Song income has no split of its own.' })).toBeVisible();
    await expect(page.getByText(/inherits the split from Glasshouse \(single\)/)).toBeVisible();
  });

  test('statement: waterfall, CSV download and the agent answers', async ({ page }) => {
    await page.goto('/money/statements/ST-2026-10-KV');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kesi Vale earned $2,346.75 from Glasshouse in October');
    await expect(page.getByRole('row', { name: /Kesi Vale nets/ })).toContainText('$2,346.75');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV' }).click();
    expect((await download).suggestedFilename()).toBe('ST-2026-10-KV.csv');
    await page.getByRole('button', { name: 'Show the costs' }).click();
    await expect(page.getByText(/recording \$2,200.00, mix and master \$800.00/)).toBeVisible();
  });

  test('royalties: artist filter and resolving unmatched lines', async ({ page }) => {
    await page.goto('/money/royalties');
    await page.getByRole('combobox', { name: /Artist/ }).selectOption('The Low Hours');
    await expect(page.getByText('October 2026 · The Low Hours')).toBeVisible();
    await page.getByRole('button', { name: 'Resolve 27 lines' }).click();
    await page.getByRole('button', { name: 'Match 24 lines to Night Bus' }).click();
    await expect(page.getByText('1,228 of 1,231 matched')).toBeVisible();
  });

  test('payouts follow the approval decision', async ({ page }) => {
    await page.goto('/money/payouts');
    await expect(page.getByRole('row', { name: /October 2026/ })).toContainText('Awaiting approval');
    await page.getByRole('row', { name: /October 2026/ }).getByRole('link', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Approve and send $1,240.18' }).click();
    await page.goto('/money/payouts');
    await expect(page.getByRole('row', { name: /October 2026/ })).toContainText('Approved');
    await page.getByRole('button', { name: 'Request form for Jules Arden' }).click();
    await expect(page.getByText('Request sent')).toBeVisible();
  });

  test('recoupment: adding a cost updates what is left to recoup', async ({ page }) => {
    await page.goto('/money/recoupment');
    const nb = page.getByRole('article', { name: 'Night Bus EP' });
    // Amounts carry hidden full-words text, so check the visible figure next to "to go".
    await expect(nb.getByText(/to go$/)).toContainText('$5,150.00');
    await page.getByRole('button', { name: 'Add a cost' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a cost' });
    await dialog.getByLabel('Release').selectOption({ label: 'Night Bus EP' });
    await dialog.getByLabel('Category').fill('Radio promo');
    await dialog.getByLabel('Full cost in dollars').fill('400');
    await dialog.getByLabel('Recoupable share').selectOption('50');
    await dialog.getByRole('button', { name: 'Add cost' }).click();
    await expect(nb.getByText(/to go$/)).toContainText('$5,350.00');
    await expect(nb.getByRole('definition').filter({ hasText: '$3,400.00' })).toBeVisible();
  });
});

test('a payee only sees their own statements', async ({ page }) => {
  await page.goto('/portal/statements/ST-2026-10-KV');
  await expect(page.getByText(/404|could not be found/i).first()).toBeVisible();
  await page.goto('/portal/statements/ST-2026-10-KV?as=kesi-vale');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('$2,346.75');
});

test('portal statement explains itself', async ({ page }) => {
  await page.goto('/portal/statements/ST-2026-10-KV?as=kesi-vale');
  await page.getByRole('button', { name: 'Why this amount?' }).click();
  await expect(page.getByRole('dialog')).toContainText('this is the month Glasshouse recouped');
});
