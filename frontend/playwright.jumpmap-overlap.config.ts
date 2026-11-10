import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({ ...base, testMatch: '**/jumpmap-overlap.spec.ts',
  outputDir: path.join(os.tmpdir(), 'ontop-jumpmap-overlap-results'),
  use: { ...base.use, baseURL: 'http://127.0.0.1:5309', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5309 --strictPort',
    url: 'http://127.0.0.1:5309', reuseExistingServer: false },
})
