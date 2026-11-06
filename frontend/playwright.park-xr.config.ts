import { defineConfig } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

export default defineConfig({
  testDir: './tests/park-xr', workers: 1, timeout: 120000,
  outputDir: path.join(os.tmpdir(), 'ontop-park-xr-results'),
  use: { baseURL: 'http://127.0.0.1:5289', channel: 'chrome', headless: true,
    viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5289 --strictPort',
    url: 'http://127.0.0.1:5289', reuseExistingServer: false },
})
