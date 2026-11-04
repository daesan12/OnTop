import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({ ...base,
  testMatch: '**/world-typing.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5219' },
  webServer: { ...base.webServer, command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5219 --strictPort',
    url: 'http://127.0.0.1:5219' },
})
