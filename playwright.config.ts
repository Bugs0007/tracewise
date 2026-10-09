import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build (`npm run build` first) served by `vite preview`.
export default defineConfig({
  testDir: '.',
  // `SHOTS=1 npx playwright test` regenerates the README screenshots instead of running the e2e suite
  testMatch: process.env.SHOTS ? ['scripts/screenshots.spec.ts'] : ['tests/e2e/**/*.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
