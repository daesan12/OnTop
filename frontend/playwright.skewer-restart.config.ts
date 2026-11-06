import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/skewer-coop', testMatch: 'restart-modal.spec.ts', workers: 1, timeout: 30000,
  outputDir: path.join(os.tmpdir(), 'ontop-skewer-restart-results'),
  use: { baseURL: 'http://127.0.0.1:5263', viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode skewer-restart-test --host 127.0.0.1 --port 5263 --strictPort',
    url: 'http://127.0.0.1:5263/tests/skewer-coop/fixtures/restart-modal.html', reuseExistingServer: !process.env.CI },
})
