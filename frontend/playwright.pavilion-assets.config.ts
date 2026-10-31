import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'
export default defineConfig({ ...base, testMatch: 'pavilion-assets.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5229' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5229 --strictPort',
    url: 'http://127.0.0.1:5229', reuseExistingServer: false },
})
