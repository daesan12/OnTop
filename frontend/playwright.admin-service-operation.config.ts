import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: '**/admin-service-operation.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5298' },
  webServer: {
    ...base.webServer,
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5298 --strictPort',
    url: 'http://127.0.0.1:5298',
  },
})
