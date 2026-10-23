import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({
  testDir: './tests/e2e',
  // Preview-only mock assertions use playwright.facilities.config.ts.
  testIgnore: '**/m04.spec.ts',
  timeout: 120_000,
  workers: 1,
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(os.tmpdir(), 'ontop-fe-e2e'),
  use: {
    baseURL: 'http://127.0.0.1:5197',
    channel: 'msedge',
    viewport: { width: 1920, height: 1080 },
    headless: true,
    trace: 'off',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 5197 --strictPort',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: true,
  },
})
