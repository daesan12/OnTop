import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'
export default defineConfig({
  ...base, testDir: './tests',
  testMatch: ['**/park-bungeoppang/{preparation,bungeoppang}.spec.ts', '**/park-integration/jumpmap.spec.ts',
    '**/park-integration/omok-qa.spec.ts', '**/park-integration/omok-tablet-qa.spec.ts', '**/park-integration/onecard-qa.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5241' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5241 --strictPort',
    url: 'http://127.0.0.1:5241', reuseExistingServer: false, env: { VITE_BUNGEOPPANG_RULES_VERSION: 'v5' } },
})
