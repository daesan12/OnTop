import { defineConfig } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

export default defineConfig({
  testDir: './tests/park-integration', testMatch: 'stone-spectating.spec.ts', workers: 1, timeout: 120000,
  outputDir: path.join(os.tmpdir(), 'ontop-stone-spectating-results'),
  use: { baseURL: 'http://127.0.0.1:5227', channel: 'msedge', headless: true, viewport: { width: 1920, height: 1080 } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5227 --strictPort',
    url: 'http://127.0.0.1:5227', reuseExistingServer: false },
})
