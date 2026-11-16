import os from 'node:os'
import path from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'ranking-pages.spec.ts', workers: 1,
  outputDir: path.join(os.tmpdir(), 'ontop-ranking-pages-e2e'), timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5296', channel: 'msedge', viewport: { width: 1920, height: 1080 }, headless: true },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode layout-preview --host 127.0.0.1 --port 5296 --strictPort', url: 'http://127.0.0.1:5296', reuseExistingServer: false },
})
