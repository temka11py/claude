import { defineConfig } from '@playwright/test';

// Assumes `npm run dev` (API :4000 + Vite :5173) is running, or starts it.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'mn-MN',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev --prefix ..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
