import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1, // one retry only — a flaky test that needs more than that is a bad test, not a slow app
  reporter: 'list',
  use: {
    baseURL: process.env.SCMS_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
});
