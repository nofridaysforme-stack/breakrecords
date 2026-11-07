import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: './tests',
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
    // Flows, accessibility and layout at desktop and phone width.
    { name: 'desktop', testMatch: 'e2e/**/*.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', testMatch: 'e2e/**/*.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    // One screenshot per design frame, each at its frame's own size (tests/visual/{id}.spec.ts).
    { name: 'visual', testMatch: 'visual/**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
  ],
});
