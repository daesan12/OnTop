import { defineConfig } from '@playwright/test'
import park from './playwright.park.config'

// Keep this review isolated from the shared park development server on 5202.
export default defineConfig({
  ...park,
  use: { ...park.use, baseURL: 'http://127.0.0.1:5229' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5229 --strictPort',
    url: 'http://127.0.0.1:5229', reuseExistingServer: false,
  },
})
