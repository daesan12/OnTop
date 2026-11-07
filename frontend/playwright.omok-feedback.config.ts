import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: ['**/omok-forbidden.spec.ts', '**/omok-camera.spec.ts', '**/omok.spec.ts', '**/omok-migration.spec.ts', '**/bench-public-watch.spec.ts', '**/follow-bench-admin.spec.ts'],
  testIgnore: [],
  webServer: { ...base.webServer, command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort' },
})
