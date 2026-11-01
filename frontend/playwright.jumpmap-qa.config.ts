import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'
export default defineConfig({
  ...base, testMatch: '**/jumpmap.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5238' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5238 --strictPort',
    url: 'http://127.0.0.1:5238', reuseExistingServer: false },
})
