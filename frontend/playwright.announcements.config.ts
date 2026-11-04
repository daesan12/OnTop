import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({ ...base, testMatch: '**/announcements.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5227' },
  webServer: { ...base.webServer, command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5227 --strictPort', url: 'http://127.0.0.1:5227' },
})
