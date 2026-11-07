import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Live mode: Postgres, sign-in, and the approvals and catalog modules on the live backend. Needs a migrated
// database and the two connection strings below (see docs/STRATEGY.md, "Run live locally").
const PORT = 3101;
export const MAILBOX = path.resolve(__dirname, 'test-results/mailbox');

export default defineConfig({
  testDir: './tests/live',
  outputDir: 'test-results/live',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './tests/live/global-setup.ts',
  use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 1000 }, trace: 'off' },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: process.env.TEST_APP_DATABASE_URL ?? '',
      BR_AUTH: 'required',
      BR_LIVE_MODULES: 'approvals,catalog',
      AUTH_SECRET: 'live-e2e-secret-not-for-production-0123456789',
      APP_URL: `http://localhost:${PORT}`,
      AUTH_TEST_MAILBOX: MAILBOX,
      AUTH_IP_LIMIT: '10000',
    },
  },
});
