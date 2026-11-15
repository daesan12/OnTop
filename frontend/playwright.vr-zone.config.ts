import { defineConfig } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'vr-zone.spec.ts', workers: 1, timeout: 120000,
  outputDir: path.join(os.tmpdir(), 'ontop-vr-zone-qa'),
  projects: [{ name: 'local-skewer-practice' }],
  use: { baseURL: 'http://127.0.0.1:5287', viewport: { width: 1440, height: 900 }, headless: true,
    launchOptions: { ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.skewer.config.ts --host 127.0.0.1 --port 5287 --strictPort', url: 'http://127.0.0.1:5287', reuseExistingServer: false },
})
