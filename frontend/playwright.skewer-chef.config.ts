import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({
  testDir: './tests/skewer-chef', workers: 1, timeout: 60000,
  outputDir: path.join(os.tmpdir(), 'ontop-skewer-chef-results'),
  use: { baseURL: 'http://127.0.0.1:5241', viewport: { width: 1664, height: 941 }, launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--mute-audio'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.skewer-chef.config.ts --port 5241', url: 'http://127.0.0.1:5241/skewer-chef.html', reuseExistingServer: false },
})
