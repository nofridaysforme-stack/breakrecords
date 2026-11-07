import { frame } from './frame';

// 2d shows the two low-risk rows selected for bulk approve.
frame({
  id: '2d', route: '/approvals', width: 1440, height: 960,
  prepare: async (page) => {
    await page.getByRole('checkbox', { name: /Payout batch/ }).check();
    await page.getByRole('checkbox', { name: /MLC registration/ }).check();
  },
});
