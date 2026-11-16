import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

/** Final jump rope sound pack: event-to-sound wiring on the unranked preview, with a fixed page clock. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'jump-rope-audio-preview.spec.ts',
  timeout: 120000,
  workers: 1,
  outputDir: path.join(os.tmpdir(), 'ontop-jump-rope-audio'),
  use: {
    channel: 'msedge', headless: true,
    baseURL: 'http://127.0.0.1:5206',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'pnpm exec vite --config vite.jump-rope-preview.config.ts --mode jump-rope-preview',
    url: 'http://127.0.0.1:5206/__dev/jump-rope.html',
    reuseExistingServer: true,
  },
})
