import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({
  ...base, testMatch: '**/jumpmap.spec.ts',
  outputDir:path.join(os.tmpdir(),'ontop-jumpmap-ranking-qa'),
  use: { ...base.use, baseURL: 'http://127.0.0.1:5295' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5295 --strictPort',
    url: 'http://127.0.0.1:5295', reuseExistingServer: false },
})
