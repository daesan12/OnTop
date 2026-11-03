import { defineConfig } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'plus-minus.spec.ts', workers: 1, timeout: 180000,
  outputDir: path.join(os.tmpdir(), 'ontop-plus-minus-qa'),
  projects: [{ name: 'latest-park-plus-minus', metadata: { generatedPark: true } }],
  use: { baseURL: 'http://127.0.0.1:5297', viewport: { width: 1440, height: 900 }, headless: true,
    launchOptions: { ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5297 --strictPort', url: 'http://127.0.0.1:5297', reuseExistingServer: false,
    env: { VITE_PLUS_MINUS_PREVIEW: 'false' } },
})
