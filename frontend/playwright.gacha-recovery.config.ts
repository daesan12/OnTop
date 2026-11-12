import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', testMatch: ['gacha-recovery.spec.ts', 'gacha-reveal.spec.ts'], workers: 1, timeout: 60000,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? '../output/gacha-recovery-20261112',
  use: { baseURL: 'http://127.0.0.1:5242', channel: 'msedge', headless: true, viewport: { width: 1600, height: 1000 } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5242 --strictPort',
    url: 'http://127.0.0.1:5242', reuseExistingServer: false },
})
