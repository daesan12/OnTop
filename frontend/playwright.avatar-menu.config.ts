import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'

export default defineConfig({ ...base,
  testDir: './tests',
  testMatch: ['park-integration/avatar-menu.spec.ts', 'e2e/follow-bench-admin.spec.ts'],
  grep: /avatar right click|ordinary dev exposes/,
  metadata: { generatedPark: true },
  use: { ...base.use, baseURL: 'http://127.0.0.1:5228' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5228 --strictPort',
    url: 'http://127.0.0.1:5228', reuseExistingServer: false },
})
