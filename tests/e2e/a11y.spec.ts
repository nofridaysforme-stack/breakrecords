import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Every Batch 1 route and state: no serious or critical axe violations, no sideways scroll.
const ROUTES = [
  '/', '/?state=empty', '/?state=working', '/?state=blocked', '/?state=error', '/?state=partial',
  '/approvals', '/approvals?state=empty', '/approvals?state=working', '/approvals?state=blocked', '/approvals?state=error', '/approvals?state=partial',
  '/approvals/apr_payout_oct', '/approvals/apr_producer', '/approvals/apr_mlc', '/approvals/apr_grant',
  '/releases', '/releases/rel_glasshouse',
  '/onboarding/welcome', '/onboarding/profile', '/onboarding/name', '/onboarding/country', '/onboarding/distributor',
  '/onboarding/catalog', '/onboarding/pro', '/onboarding/autonomy', '/onboarding/finish',
  '/dev/type', '/dev/components',
];

for (const route of ROUTES) {
  test(`${route} is accessible and fits the screen`, async ({ page }) => {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(scroll, 'page scrolls sideways').toBeLessThanOrEqual(width);
  });
}
