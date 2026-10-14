import { defineConfig, devices } from '@playwright/test';

/**
 * Drives the real app against a real API against a real Postgres. The point of
 * this suite is not coverage — it is the one end-to-end claim the unit and
 * integration tests cannot make: a figure on screen opens the entries behind
 * it (I3).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env['FINCORE_WEB_URL'] ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
