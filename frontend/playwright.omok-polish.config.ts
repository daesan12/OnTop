import { defineConfig } from '@playwright/test'
import base from './playwright.omok-qa.config'
export default defineConfig({ ...base,
  testMatch: ['**/omok-qa.spec.ts', '**/omok-tablet-qa.spec.ts', '**/omok-polish.spec.ts', '**/stone-spectating.spec.ts', '**/follow-debris.spec.ts', '**/onecard-qa.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5245' },
  webServer: { ...base.webServer,
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5245 --strictPort',
    url: 'http://127.0.0.1:5245', reuseExistingServer: false } })
