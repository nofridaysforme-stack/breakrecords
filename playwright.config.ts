import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'visual/**/*.spec.ts'],
  outputDir: 'test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
});
