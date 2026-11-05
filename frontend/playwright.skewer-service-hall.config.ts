import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/service-hall', workers: 1, timeout: 90000,
  outputDir: path.join(os.tmpdir(), 'ontop-skewer-service-hall-results'),
  use: {
    baseURL: 'http://127.0.0.1:5239', viewport: { width: 1664, height: 941 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--mute-audio'] },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config vite.skewer-service-hall.config.ts --port 5239',
    url: 'http://127.0.0.1:5239/skewer-service-hall.html', reuseExistingServer: false,
  },
})
