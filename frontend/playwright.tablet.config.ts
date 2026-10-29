import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
  ...base,
  testMatch: ['**/tablet-flow.spec.ts', '**/public-chairs.spec.ts'],
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5198' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode tablet --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198', reuseExistingServer: true,
  },
})
