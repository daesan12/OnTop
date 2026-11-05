import { defineConfig } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/halligalli-ui',
  workers: 1,
  timeout: 120_000,
  outputDir: path.resolve('../docs/qa/halligalli-status-bar/test-results'),
  use: {
    baseURL: 'http://127.0.0.1:5211',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    trace: 'off',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5211 --strictPort',
    url: 'http://127.0.0.1:5211/tests/halligalli-ui/status-bar-fixture.html',
    reuseExistingServer: false,
  },
})
