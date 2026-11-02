import { defineConfig } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'welcome-tour.spec.ts', workers: 1, timeout: 180000,
  outputDir: path.join(os.tmpdir(), 'ontop-welcome-tour-qa'),
  projects: [{ name: 'latest-park-welcome-tour', metadata: { generatedPark: true } }],
  use: { baseURL: 'http://127.0.0.1:5192', viewport: { width: 1440, height: 900 }, headless: true,
    launchOptions: { ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5192 --strictPort', url: 'http://127.0.0.1:5192', reuseExistingServer: false,
    env: { VITE_RPS_ROULETTE_PREVIEW: 'false' } },
})
