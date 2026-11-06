import { defineConfig } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'carry.spec.ts',
  workers: 1,
  timeout: 120000,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(os.tmpdir(), 'ontop-carry-results'),
  use: {
    baseURL: 'http://127.0.0.1:5296', channel: 'msedge', headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5296 --strictPort',
    url: 'http://127.0.0.1:5296', reuseExistingServer: false,
  },
})
