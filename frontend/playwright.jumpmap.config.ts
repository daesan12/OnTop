import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({ testDir: './tests/park-integration', testMatch: 'jumpmap.spec.ts', workers: 1, timeout: 120000,
  outputDir: path.join(os.tmpdir(), 'ontop-jumpmap-results'),
  use: { baseURL: 'http://127.0.0.1:5214', channel: 'msedge', headless: true, viewport: { width: 1920, height: 1080 } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5214 --strictPort', url: 'http://127.0.0.1:5214', reuseExistingServer: false },
})
