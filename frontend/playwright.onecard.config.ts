import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/e2e', testMatch: ['onecard.spec.ts', 'onecard-ux.spec.ts', 'onecard-four-player.spec.ts'], timeout: 120_000, workers: 1,
  outputDir: path.join(os.tmpdir(), 'ontop-onecard-ux-e2e'),
  use: { baseURL: 'http://127.0.0.1:5213', channel: 'msedge', viewport: { width: 1920, height: 1080 }, headless: true, trace: 'off' },
  webServer: { env: { VITE_TABLET_LOBBY: 'false', VITE_ONECARD_PRANKS: 'true' },
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5213 --strictPort',
    url: 'http://127.0.0.1:5213', reuseExistingServer: false },
})
