import { defineConfig } from '@playwright/test'
import base from './playwright.bungeoppang-qa.config'
export default defineConfig({ ...base, testMatch: ['**/preparation.spec.ts', '**/polish.spec.ts', '**/ranking-customers.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5242' },
  webServer: { ...base.webServer, command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5242 --strictPort',
    url: 'http://127.0.0.1:5242', reuseExistingServer: false } })
