import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/skewer-coop', testMatch: 'feedback.spec.ts', workers: 1, timeout: 60000,
  outputDir: path.join(os.tmpdir(), 'ontop-skewer-feedback-results'),
  use: { baseURL: 'http://127.0.0.1:5265', viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.CHROME_BIN
      ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),
      args: ['--mute-audio'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.skewer-chef.config.ts --port 5265 --strictPort',
    url: 'http://127.0.0.1:5265/skewer-chef.html', reuseExistingServer: false },
})
