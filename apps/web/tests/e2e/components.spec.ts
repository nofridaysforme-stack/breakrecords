import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('component gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/components');
    await page.evaluate(() => document.fonts.ready);
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target}`)).toEqual([]);
  });

  test('money reads in full words', async ({ page }) => {
    const trigger = page.getByRole('button', { name: '$2,346.75', exact: true });
    await expect(trigger).toHaveAccessibleDescription(/two thousand three hundred forty-six dollars and seventy-five cents/);
    await expect(page.getByText('minus five hundred dollars').first()).toBeAttached();
  });

  test('money opens its waterfall', async ({ page }) => {
    await page.getByRole('button', { name: '$2,346.75', exact: true }).click();
    const pop = page.getByRole('dialog', { name: 'Kesi Vale · Glasshouse · October' });
    await expect(pop).toBeVisible();
    await expect(pop.getByRole('row', { name: /Kesi Vale nets/ })).toContainText('$2,346.75');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
  });

  test('signatures can never be bulk selected', async ({ page }) => {
    const sig = page.getByRole('checkbox', { name: /Producer agreement, Marco Dela/ });
    await expect(sig).toBeDisabled();
    await expect(sig).toHaveAccessibleDescription('Signatures must be approved one at a time.');
    await expect(page.getByText('2 low-risk items selected')).toBeVisible();
    await page.getByRole('checkbox', { name: /MLC registration/ }).uncheck();
    await expect(page.getByText('1 low-risk item selected')).toBeVisible();
  });

  test('draft split shows the computed gap, not a stored one', async ({ page }) => {
    const v5 = page.getByRole('region', { name: /Draft version 5/ });
    await expect(v5.getByRole('status')).toHaveText(/4\.85% of net profit is unassigned/);
    await expect(page.getByRole('region', { name: /Version 4/ })).toContainText('Signed by all 4 · totals 100%');
  });

  test('split bar segments move with arrow keys and announce details', async ({ page }) => {
    const bar = page.getByRole('group', { name: /Version 4.*shares/ });
    const first = bar.getByRole('button').first();
    await first.focus();
    await expect(first).toHaveAccessibleName(/^Marco Dela, three percent/);
    await page.keyboard.press('ArrowRight');
    await expect(bar.getByRole('button', { name: /^Label 48\.5%: Northline Records, forty-eight point five percent/ })).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText('Northline Records');
    await page.keyboard.press('End');
    await expect(bar.getByRole('button', { name: /Ari Monroe/ })).toBeFocused();
  });

  test('autonomy dial moves with arrow keys and explains disabled stops', async ({ page }) => {
    const dial = page.getByRole('group', { name: 'Autonomy', exact: true });
    await dial.getByRole('radio', { name: /Draft and wait/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dial.getByRole('radio', { name: /Act within limits/ })).toBeChecked();
    const legal = page.getByRole('group', { name: 'Autonomy, Legal' });
    await expect(legal.getByRole('radio', { name: /Act within limits/ })).toBeDisabled();
    await expect(legal).toContainText('Set a spend cap first to unlock this.');
  });

  test('industry terms explain themselves on focus', async ({ page }) => {
    const mlc = page.getByRole('button', { name: 'MLC', exact: true });
    await mlc.focus();
    await expect(page.getByRole('tooltip')).toContainText('Mechanical Licensing Collective');
    await expect(mlc).toHaveAccessibleDescription(/Mechanical Licensing Collective/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
  });
});
