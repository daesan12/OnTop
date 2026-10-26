import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Browser plugin not available; use the repository's installed Playwright/Edge.
export default defineConfig({
  ...base,
  testDir: './tests/bungeoppang-v4-e2e',
  testIgnore: [],
  timeout: 150000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5195', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'pnpm dev:bungeoppang --host 127.0.0.1 --port 5195 --strictPort', url: 'http://127.0.0.1:5195', reuseExistingServer: false },
});
