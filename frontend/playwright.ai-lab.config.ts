import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'ai-lab.spec.ts', timeout: 30000, workers: 1,
  outputDir: path.join(os.tmpdir(), 'ontop-ai-lab-e2e'),
  use: { channel: 'msedge', headless: true, baseURL: 'http://127.0.0.1:5210', viewport: { width: 1440, height: 1080 } },
  // Start the backend with scripts/start-ai-lab.ps1. Never start a public/production profile from tests.
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.ai-lab.config.ts', url: 'http://127.0.0.1:5210/ai-lab.html', reuseExistingServer: true },
})
