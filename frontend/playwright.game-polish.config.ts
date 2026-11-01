import { defineConfig } from '@playwright/test'
import base from './playwright.bungeoppang-polish.config'
export default defineConfig({ ...base, testDir: './tests',
  testMatch: ['**/park-bungeoppang/preparation.spec.ts', '**/park-bungeoppang/polish.spec.ts',
    '**/park-bungeoppang/ranking-customers.spec.ts', '**/park-integration/stone-base-qa.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5244' },
  webServer: { ...base.webServer,
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5244 --strictPort',
    url: 'http://127.0.0.1:5244', reuseExistingServer: false } })
