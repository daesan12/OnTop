import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Isolated port so ongoing QA in other worktrees cannot be mistaken for this app.
export default defineConfig({
  ...base,
  // Historical filename; this now exercises the normal v4 HTTP adapter, including time sync.
  testMatch: /bungeoppang(?:-time)?\.spec\.ts/,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5194' },
  webServer: { command: 'pnpm dev --host 127.0.0.1 --port 5194 --strictPort', url: 'http://127.0.0.1:5194', reuseExistingServer: false },
});
