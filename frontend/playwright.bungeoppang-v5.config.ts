import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base, testDir: './tests/bungeoppang-v5-e2e', testIgnore: [], timeout: 260_000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5209', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode bungeoppang-v5-preview --host 127.0.0.1 --port 5209 --strictPort',
    url: 'http://127.0.0.1:5209', reuseExistingServer: false },
});
