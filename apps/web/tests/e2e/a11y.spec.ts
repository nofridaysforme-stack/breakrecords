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
  '/splits/gh-rec', '/splits/gh-song', '/money/royalties', '/money/statements', '/money/statements/ST-2026-10-KV',
  '/money/payouts', '/money/recoupment', '/money/budgets',
  '/portal', '/portal/statements', '/portal/statements/ST-2026-10-MD', '/portal/statements/ST-2026-10-KV?as=kesi-vale',
  '/portal/tax', '/portal/profile', '/portal/sign',
  ...['/money/royalties', '/money/payouts', '/money/recoupment', '/money/statements/ST-2026-10-KV', '/splits/gh-rec', '/portal']
    .flatMap((r) => ['empty', 'working', 'blocked', 'error', 'partial'].map((st) => `${r}?state=${st}`)),
  // Phase F
  '/plan', '/plan?goal=Plan%20an%20EP%20for%20May', '/plan?goal=Find%20money%20I%27m%20owed',
  // Batch 3
  '/catalog/songs', '/catalog/releases', '/catalog/assets', '/contracts/templates/producer',
  '/funding/applications', '/funding/offers',
  '/settings/profile', '/settings/limits', '/settings/statements', '/settings/integrations', '/settings/team', '/settings/billing',
  ...['/catalog/recordings', '/contracts', '/contracts/templates/artist', '/rights/registrations', '/rights/unclaimed', '/rights/claims',
    '/funding', '/funding/offers/compare', '/departments', '/activity', '/settings/routing', '/settings/white-label', '/roster']
    .flatMap((r) => ['default', 'empty', 'working', 'blocked', 'error', 'partial'].map((st) => (st === 'default' ? r : `${r}?state=${st}`))),
];

for (const route of Array.from(new Set(ROUTES))) {
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
