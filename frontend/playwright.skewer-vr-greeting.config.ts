import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/skewer-coop', testMatch: ['greeting-turn.spec.ts', 'feedback.spec.ts', 'pause.spec.ts', 'restart-modal.spec.ts'], workers: 1, timeout: 60000,
  outputDir: path.join(os.tmpdir(), 'ontop-skewer-vr-greeting-results'),
  use: { baseURL: 'http://127.0.0.1:5272', viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.CHROME_BIN
      ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), args: ['--mute-audio'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.skewer-vr-greeting.config.ts',
    url: 'http://127.0.0.1:5272/tests/skewer-coop/fixtures/greeting-turn.html', reuseExistingServer: false },
})
