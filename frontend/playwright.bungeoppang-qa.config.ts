import { defineConfig } from '@playwright/test'
import base from './playwright.park-bungeoppang.config'

export default defineConfig({
  ...base,
  testMatch: ['**/preparation.spec.ts', '**/bungeoppang.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5237' },
  webServer: { ...base.webServer,
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5237 --strictPort',
    url: 'http://127.0.0.1:5237', reuseExistingServer: false },
})
