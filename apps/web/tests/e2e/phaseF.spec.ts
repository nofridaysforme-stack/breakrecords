import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** ⌘K before the page hydrates does nothing, as for a person; press again until the bar opens. */
async function openBar(page: Page) {
  const bar = page.getByRole('dialog', { name: 'Search or tell me a goal' });
  await expect(async () => {
    if (!(await bar.isVisible())) await page.keyboard.press(`${mod}+K`);
    await expect(bar).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  return bar;
}

test('Ctrl+K opens the command bar on any screen and Enter opens a result', async ({ page }) => {
  await page.goto('/contracts');
  const bar = await openBar(page);
  const box = bar.getByRole('combobox');
  await expect(box).toBeFocused();
  await box.fill('static hymn');
  await expect(bar.getByRole('option').first()).toContainText('Static Hymn');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/catalog\/recordings\?id=static-hymn/);
  await expect(page.getByRole('complementary', { name: 'Static Hymn details' })).toBeVisible();
});

test('arrow keys move the selection; Esc closes', async ({ page }) => {
  await page.goto('/money/royalties');
  await openBar(page);
  const box = page.getByRole('combobox', { name: 'Search or tell me a goal' });
  await box.fill('kesi');
  const first = await box.getAttribute('aria-activedescendant');
  await box.press('ArrowDown');
  await expect(box).not.toHaveAttribute('aria-activedescendant', first!);
  await expect(page.locator(`[id="${await box.getAttribute('aria-activedescendant')}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Search or tell me a goal' })).toBeHidden();
});

test('a plain-language goal starts a plan, and approving it records the decision', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await openBar(page);
  const box = page.getByRole('combobox', { name: 'Search or tell me a goal' });
  await box.fill('Plan an EP for May');
  await expect(page.getByRole('option').first()).toContainText('Plan this');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/plan\?goal=Plan/);
  await expect(page.getByRole('heading', { name: 'Release an EP on May 7', level: 2 })).toBeVisible();
  await expect(page.getByText('No budget given.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve plan' }).click();
  await expect(page.getByText('Plan approved.')).toBeVisible();
});

test('the Label Head panel answers about the current screen and shows the Needs you count', async ({ page }) => {
  await page.goto('/funding');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const trigger = isPhone(page) ? page.getByRole('button', { name: 'Label Head', exact: true }) : page.getByRole('button', { name: 'Ask the Label Head' });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Label Head' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /Needs you/ })).toContainText('4');
  await expect(panel).toContainText('On this screen · Funding');
  await panel.getByRole('button', { name: 'Which offer is cheaper?' }).click();
  await expect(panel).toContainText('about $960 over 14 months');
  await panel.getByLabel('Ask the Label Head').fill('what about glasshouse');
  await panel.getByLabel('Ask the Label Head').press('Enter');
  await expect(panel).toContainText('I don’t have a direct answer');
  await expect(panel.getByRole('link', { name: /Glasshouse/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the command bar can hand a question to the Label Head', async ({ page }) => {
  await page.goto('/');
  await openBar(page);
  const box = page.getByRole('combobox', { name: 'Search or tell me a goal' });
  await box.fill('glasshouse budget');
  await page.getByRole('option', { name: /Ask the Label Head/ }).click();
  await expect(page.getByRole('dialog', { name: 'Label Head' })).toContainText('glasshouse budget');
});

test('compact density applies everywhere and survives a reload', async ({ page }) => {
  await page.goto('/settings/profile');
  await page.getByRole('radio', { name: /Compact/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.goto('/contracts');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('html')).toHaveCSS('--cell-pad-y', '8px');
  await page.goto('/settings/profile');
  await page.getByRole('radio', { name: /Comfortable/ }).check();
  await expect(page.locator('html')).not.toHaveAttribute('data-density', 'compact');
});

test('under reduced motion, drawers appear without sliding and nothing pulses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openBar(page);
  await page.keyboard.press('Escape');
  const trigger = isPhone(page) ? page.getByRole('button', { name: 'Label Head', exact: true }) : page.getByRole('button', { name: 'Ask the Label Head' }).first();
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Label Head' });
  await expect(panel).toHaveCSS('animation-duration', '0s');
  await page.keyboard.press('Escape');
  const dot = page.locator('[class*="working"] [class*="dot"]').first();
  if (await dot.count()) await expect(dot).toHaveCSS('animation-duration', '0s');
});

test('the open command bar and panel pass axe', async ({ page }) => {
  await page.goto('/');
  await openBar(page);
  await page.getByRole('combobox', { name: 'Search or tell me a goal' }).fill('marco');
  const serious = async () => (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);
  expect(await serious()).toEqual([]);
  await page.keyboard.press('Escape');
  await page.goto('/catalog/recordings');
  await (isPhone(page) ? page.getByRole('button', { name: 'Label Head', exact: true }) : page.getByRole('button', { name: 'Ask the Label Head' })).click();
  await page.getByRole('dialog', { name: 'Label Head' }).getByRole('button', { name: 'Why is Low Light at 46%?' }).click();
  expect(await serious()).toEqual([]);
});

test('the payee portal has no command bar', async ({ page }) => {
  await page.goto('/portal');
  await page.keyboard.press(`${mod}+K`);
  await expect(page.getByRole('dialog', { name: 'Search or tell me a goal' })).toHaveCount(0);
});

test.describe('desktop only', () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), 'Desktop layout'));

  test('the Home search box opens the command bar and focus returns to it', async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: /Search or tell me a goal/ });
    await trigger.click();
    await expect(page.getByRole('combobox', { name: 'Search or tell me a goal' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  // flows.md > Responsive: 1280 collapses the right rail, 1024 is a 64px icon rail.
  const ROUTES = ['/', '/approvals', '/approvals/apr_payout_oct', '/releases/rel_glasshouse', '/splits/gh-rec', '/money/royalties',
    '/money/statements/ST-2026-10-KV', '/money/payouts', '/catalog/recordings', '/contracts', '/rights/registrations', '/funding',
    '/funding/offers/compare', '/departments', '/activity', '/settings/routing', '/settings/white-label', '/roster', '/plan?goal=Find%20grants'];
  for (const width of [1280, 1024, 768]) {
    test(`nothing scrolls sideways at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.goto(route);
        const [scroll, w] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        expect(scroll, `${route} at ${width}`).toBeLessThanOrEqual(w);
      }
    });
  }

  test('1280 shows the rail as a toggle; 1024 shows the 64px icon rail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Agent activity' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Agent activity' })).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 900 });
    const box = await page.locator('aside').first().boundingBox();
    expect(Math.round(box!.width)).toBe(64);
  });
});
