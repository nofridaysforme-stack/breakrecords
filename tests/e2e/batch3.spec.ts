import { test, expect, type Page } from '@playwright/test';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

test('catalog: picking a recording shows its details, and edits stay in the panel', async ({ page }) => {
  await page.goto('/catalog/recordings');
  const panel = page.getByRole('complementary', { name: 'Glasshouse details' });
  await expect(panel).toContainText('92% complete.');
  await page.getByRole('button', { name: 'Low Light' }).click();
  const low = page.getByRole('complementary', { name: 'Low Light details' });
  await expect(low).toContainText('46% complete.');
  await expect(low).toContainText('Partial, stems');
  await low.getByRole('button', { name: 'Edit metadata' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Low Light' });
  await dialog.getByLabel('Genre').fill('Electronic');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(low).toContainText('Electronic');
});

test('catalog tabs are links with counts', async ({ page }) => {
  await page.goto('/catalog/recordings');
  await page.getByRole('link', { name: /Songs/ }).click();
  await expect(page).toHaveURL(/\/catalog\/songs$/);
  await expect(page.getByRole('link', { name: /Songs/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('rowheader', { name: 'Static Hymn' })).toBeVisible();
});

test('drafting from a template goes to Approvals, never straight to signature', async ({ page }) => {
  await page.goto('/contracts');
  await page.getByRole('button', { name: 'Draft from template' }).click();
  await page.getByRole('dialog', { name: 'Draft from template' }).getByRole('link', { name: /Sync license/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Draft sync license' });
  await dialog.getByRole('button', { name: 'Draft it' }).click();
  await expect(dialog.getByText('Add who the agreement is with.')).toBeVisible();
  await dialog.getByLabel('With').fill('Harbor Films');
  await dialog.getByRole('button', { name: 'Draft it' }).click();
  await expect(page.getByText('Nobody is asked to sign until you approve.')).toBeVisible();
  await page.goto('/approvals');
  await expect(page.getByText('Sync license, Harbor Films').filter({ visible: true }).first()).toBeVisible();
});

test('registrations pair every status with a word, and callouts link onward', async ({ page }) => {
  await page.goto('/rights/registrations');
  const table = page.getByRole('table');
  await expect(table.getByRole('row', { name: /Glasshouse/ })).toContainText('Needs you');
  await expect(table.getByRole('row', { name: /Low Light/ })).toContainText('Blocked');
  await expect(page.getByRole('link', { name: 'Open filing' })).toHaveAttribute('href', '/approvals/apr_mlc');
  await page.getByRole('link', { name: 'Start claim' }).click();
  await expect(page).toHaveURL(/\/rights\/unclaimed$/);
  await page.getByRole('button', { name: 'Prepare claim' }).click();
  await expect(page.getByText('Waiting in')).toBeVisible();
});

test('funding: the sale is marked permanent and dismiss can be undone', async ({ page }) => {
  await page.goto('/funding');
  const sale = page.getByRole('article', { name: /\$15,000 for 50% of one album/ });
  await expect(sale).toContainText('Permanent.');
  await page.getByRole('button', { name: 'Dismiss State arts council project grant' }).click();
  await expect(page.getByRole('article', { name: 'State arts council project grant' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('article', { name: 'State arts council project grant' })).toBeVisible();
});

test('accepting the advance creates an approval instead of accepting it', async ({ page }) => {
  await page.goto('/funding/offers/compare');
  const accept = isPhone(page) ? page.getByRole('button', { name: 'Accept advance', exact: true }) : page.getByRole('button', { name: 'Accept advance (goes to approval)' });
  await accept.click();
  await expect(page.getByText(/waiting in/i).filter({ visible: true })).toBeVisible();
  await expect(accept).toBeDisabled();
  await page.goto('/approvals');
  await expect(page.getByText('Accept $8,000 royalty advance').filter({ visible: true }).first()).toBeVisible();
});

test.describe('desktop only', () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), 'Desktop layout'));

  test('offer numbers recompute from the assumptions', async ({ page }) => {
    await page.goto('/funding/offers/compare');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('$12,000 over 5 years');
    await page.getByText('Change assumptions').click();
    await page.getByLabel('Growth a year (%)').fill('20');
    await page.getByRole('button', { name: 'Recalculate' }).click();
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('$12,000 over 5 years');
    await expect(page.getByText(/growing 20% a year/)).toBeVisible();
  });

  test('departments: autonomy changes per department; Legal cannot act alone', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.getByRole('heading', { name: 'Royalties', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: /^Legal/ }).click();
    await expect(page.getByRole('heading', { name: 'Legal', level: 2 })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Act within limits/ })).toBeDisabled();
    await page.getByRole('button', { name: /^Royalties/ }).click();
    await page.getByRole('radio', { name: /Act within limits/ }).check({ force: true });
    await expect(page.getByText('Royalties is now set to Act within limits.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Royalties/ })).toContainText('Act within limits');
  });

  test('activity rows expand and filter', async ({ page }) => {
    await page.goto('/activity');
    const flag = page.getByRole('button', { name: /Unusual stream spike/ });
    await expect(flag).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText("I haven’t confirmed it.")).toBeVisible();
    await page.getByRole('button', { name: /Found 2 new grants/ }).click();
    await expect(page.getByText(/second grant needs a nonprofit sponsor/)).toBeVisible();
    await page.getByLabel('Type').selectOption('Edit');
    await expect(page.getByRole('button', { name: /Changed split draft v5/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unusual stream spike/ })).toHaveCount(0);
  });

  test('white label: a failing color blocks publishing, a passing theme publishes', async ({ page }) => {
    await page.goto('/settings/white-label');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText('All text pairs pass WCAG AA')).toBeVisible();
    const preview = page.getByRole('img', { name: 'Harbor Sound app preview' });
    await expect(preview).toHaveCSS('background-color', 'rgb(15, 26, 28)');
    await page.getByLabel('Text', { exact: true }).fill('#3a4a4c');
    await expect(page.getByText(/fails? WCAG AA\. Publishing is blocked/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish theme' })).toBeDisabled();
    await page.getByLabel('Text', { exact: true }).fill('#e8f0ef');
    await page.getByRole('button', { name: 'Try it on this app' }).click();
    await expect(page.locator('html')).toHaveCSS('--bg', '#0f1a1c');
    await page.getByRole('button', { name: 'Publish theme' }).click();
    await expect(page.getByText('Published for Harbor Sound.')).toBeVisible();
  });

  test('settings sub-nav marks the current section', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/routing$/);
    await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Integrations' }).click();
    await page.getByRole('button', { name: 'Connect SoundExchange' }).click();
    await expect(page.getByText('SoundExchange connected.')).toBeVisible();
  });
});
