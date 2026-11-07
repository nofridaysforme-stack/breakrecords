import { test, expect, type Page } from '@playwright/test';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/** The Approvals count in the sidebar (desktop) or tab bar (phone). */
async function badge(page: Page) {
  const link = page.getByRole('link', { name: /^Approvals.*waiting/ }).filter({ visible: true }).first();
  const name = (await link.getAttribute('aria-label')) ?? (await link.innerText());
  const m = (await link.evaluate((el) => el.textContent ?? '')).match(/(\d+)/) ?? name.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

test('onboarding runs start to finish and lands on Home with the goal box', async ({ page }) => {
  await page.goto('/onboarding/welcome');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'How do you put out music?' })).toBeVisible();
  await page.getByRole('radio', { name: /Band/ }).check({ force: true });
  await page.getByRole('button', { name: 'Continue as Band' }).click();
  await page.getByLabel('Name').fill('The Low Hours');
  // name, country, distributor, catalog, PRO
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Set how much your agents do/ })).toBeVisible();
  await page.getByRole('radio', { name: /Act within limits/ }).check({ force: true });
  await expect(page.getByText(/With "Act within limits"/)).toBeVisible();
  await expect(page.getByText('Band', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Low Hours is set up.' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page.getByRole('heading', { name: /What are you working on\?/ })).toBeVisible();
  await expect(page.getByLabel('Your goal')).toBeVisible();
});

test('approving from Home lowers the count everywhere, and Undo restores it', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => badge(page)).toBe(4);
  await page.getByRole('article', { name: 'Payout batch for October' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Payout batch for October approved' })).toBeVisible();
  await expect.poll(() => badge(page)).toBe(3);
  await page.goto('/approvals');
  await expect.poll(() => badge(page)).toBe(3);
  await page.goto('/');
  // Approved items stay approved across pages; undo from the detail page.
  await page.goto('/approvals/apr_payout_oct');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => badge(page)).toBe(4);
});

test.describe('desktop only', () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), 'Desktop layout'));

  test('bulk approve takes low-risk items only, never signatures', async ({ page }) => {
    await page.goto('/approvals');
    await expect(page.getByRole('checkbox', { name: /Producer agreement/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: /Payout batch/ }).check();
    await page.getByRole('checkbox', { name: /MLC registration/ }).check();
    await expect(page.getByText('2 low-risk items selected')).toBeVisible();
    await page.getByRole('button', { name: 'Approve 2' }).click();
    await expect(page.getByText('2 items approved.').filter({ visible: true })).toBeVisible();
    await expect.poll(() => badge(page)).toBe(2);
    await expect(page.getByRole('article', { name: 'Payout batch for October' })).toHaveCount(0);
  });

  test('filters narrow the list and the counts', async ({ page }) => {
    await page.goto('/approvals');
    await page.getByLabel('Dept').selectOption('Legal');
    await expect(page.getByRole('tab', { name: /All/ })).toContainText('1');
    await expect(page.getByRole('article', { name: /Producer agreement/ })).toBeVisible();
    await expect(page.getByRole('article', { name: /Payout batch/ })).toHaveCount(0);
  });

  test('rejecting needs a reason', async ({ page }) => {
    await page.goto('/approvals/apr_payout_oct');
    await page.getByRole('button', { name: 'Reject with reason' }).click();
    await page.getByRole('form', { name: 'Reject with reason' }).getByRole('button', { name: 'Reject' }).click();
    // Next.js adds its own role="alert" route announcer, so find the message by text.
    await expect(page.getByText('! A reason is required to reject.')).toBeVisible();
    await expect(page.getByLabel(/Why are you rejecting this/)).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel(/Why are you rejecting this/).fill('Hold until Rue renews her W-9');
    await page.getByRole('form', { name: 'Reject with reason' }).getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText(/Rejected: "Hold until Rue renews her W-9"/)).toBeVisible();
    await expect.poll(() => badge(page)).toBe(3);
  });

  test('keyboard A approves on the detail page; typing in a field does not', async ({ page }) => {
    await page.goto('/approvals/apr_payout_oct');
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('a');
    await expect(page.getByText(/Approved. Nothing is sent before Nov 10./)).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.keyboard.press('r');
    await expect(page.getByLabel(/Why are you rejecting this/)).toBeFocused();
    await page.keyboard.type('a');
    await expect(page.getByText(/Approved\./)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByLabel(/Why are you rejecting this/)).toHaveCount(0);
  });

  test('a filing cannot be approved until every fact is confirmed', async ({ page }) => {
    await page.goto('/approvals/apr_mlc');
    const approve = page.getByRole('button', { name: 'Approve and file' });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription('Confirm all 3 facts to file.');
    for (const box of await page.getByRole('group', { name: 'Confirm these facts' }).getByRole('checkbox').all()) await box.check();
    await expect(approve).toBeEnabled();
  });

  test('holding a payee in edit mode changes what is sent', async ({ page }) => {
    await page.goto('/approvals/apr_payout_oct');
    await page.getByRole('button', { name: 'Edit then approve' }).click();
    await page.getByRole('checkbox', { name: 'Hold Rue Sato' }).check();
    await expect(page.getByRole('button', { name: 'Approve and send $1,025.98' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Total to 5 payees/ })).toContainText('$1,025.98');
  });

  test('the waterfall link explains Marco Dela’s $285.00', async ({ page }) => {
    await page.goto('/approvals/apr_payout_oct');
    await page.getByRole('button', { name: /See how Marco Dela's \$285.00 was calculated/ }).click();
    await expect(page.getByRole('dialog').getByRole('row', { name: /Marco Dela earns/ })).toContainText('$285.00');
  });

  test('changing the release date becomes a Plan approval that moves the runbook once approved', async ({ page }) => {
    await page.goto('/releases/rel_glasshouse');
    await expect(page.getByText('Sat, Mar 6, 2027')).toBeVisible();
    await page.getByRole('button', { name: 'Change date' }).click();
    await page.getByLabel('New release date').fill('2027-03-19');
    await expect(page.getByRole('dialog')).toContainText('shifts 10 tasks by 13 days later');
    await page.getByRole('button', { name: 'Send as a plan to approve' }).click();
    await expect.poll(() => badge(page)).toBe(5);
    await expect(page.getByText(/A plan to move this release to Mar 19 is waiting/)).toBeVisible();
    await expect(page.getByText('Sat, Mar 6, 2027')).toBeVisible();
    await page.goto('/approvals');
    await page.getByRole('article', { name: 'Move Glasshouse to Mar 19' }).getByRole('button', { name: 'Approve' }).click();
    await page.goto('/releases/rel_glasshouse');
    await expect(page.getByText('Fri, Mar 19, 2027')).toBeVisible();
    await expect(page.getByRole('heading', { name: '8 weeks out' }).locator('..')).toContainText('Jan 22');
  });

  test('keyboard only: inbox, review, approve', async ({ page }) => {
    await page.goto('/approvals');
    const review = page.getByRole('article', { name: 'MLC registration for 3 songs' }).getByRole('link', { name: 'Review' });
    for (let i = 0; i < 60 && !(await review.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(review).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/apr_mlc/);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 30; j++) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(() => (document.activeElement as HTMLInputElement)?.type === 'checkbox' && !(document.activeElement as HTMLInputElement).checked)) break;
      }
      await page.keyboard.press('Space');
    }
    await page.getByRole('button', { name: 'Approve and file' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Approved. Nothing is sent before Nov 12./)).toBeVisible();
  });
});

test.describe('phone only', () => {
  test.beforeEach(({ page }) => test.skip(!isPhone(page), 'Phone layout'));

  test('phone inbox: chips filter, big buttons, one more below', async ({ page }) => {
    await page.goto('/approvals');
    const approve = page.getByRole('article', { name: 'Payout batch for October' }).getByRole('button', { name: 'Approve' });
    expect((await approve.boundingBox())!.height).toBeGreaterThanOrEqual(46);
    await page.getByRole('button', { name: /1 more below/ }).click();
    await expect(page.getByRole('article', { name: 'State arts council grant draft' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign 1' }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
  });
});
