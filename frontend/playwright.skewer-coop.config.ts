import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({
  testDir: './tests/skewer-coop', workers: 1, timeout: 240000,
  outputDir: path.join(os.tmpdir(), 'ontop-skewer-coop-results'),
  use: { baseURL: 'http://127.0.0.1:5244', viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--mute-audio'] } },
})
