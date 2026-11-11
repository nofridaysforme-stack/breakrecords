import { frame } from './frame';

// 2d shows the two low-risk rows selected for bulk approve. The design predates the approval
// checks (which hold these sample cards back), so this frame turns them off to match it.
frame({
  id: '2d', route: '/approvals', width: 1440, height: 960,
  before: async (page) => {
    await page.context().addCookies([{ name: 'br_checks', value: 'off', url: 'http://localhost:3100' }]);
    await page.goto('/approvals');
    await page.evaluate(() => sessionStorage.clear());
  },
  prepare: async (page) => {
    await page.getByRole('checkbox', { name: /Payout batch/ }).check();
    await page.getByRole('checkbox', { name: /MLC registration/ }).check();
  },
});
