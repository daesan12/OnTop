import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

/** Story 420 stage 1: the unranked jump rope preview with the grandpa raid. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'jump-rope-grandpa-preview.spec.ts',
  timeout: 120000,
  workers: 1,
  outputDir: path.join(os.tmpdir(), 'ontop-jump-rope-grandpa'),
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
