import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests/e2e', testMatch: 'skins-admin.spec.ts', workers: 1, timeout: 90000,
  outputDir: '../output/skin-registration/browser',
  use: { baseURL: 'http://127.0.0.1:5236', channel: 'msedge', headless: true, viewport: { width: 1600, height: 1000 }, trace: 'off' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5236 --strictPort', url: 'http://127.0.0.1:5236', reuseExistingServer: false },
})
