import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'
export default defineConfig({
  ...base, testMatch: ['**/omok-qa.spec.ts', '**/omok-tablet-qa.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5239' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5239 --strictPort',
    url: 'http://127.0.0.1:5239', reuseExistingServer: false },
})
