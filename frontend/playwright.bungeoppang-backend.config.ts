import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Real BE v4 settlement: world/auth stay on contract fixtures; only minigame/wallet HTTP reaches
// ONTOP_E2E_API_BASE, a test server on an isolated DB. Never point it at shared DEV or production.
export default defineConfig({
  ...base,
  testDir: './tests/bungeoppang-backend-e2e',
  testIgnore: [],
  timeout: 300_000,
  use: {
    ...base.use,
    baseURL: 'http://127.0.0.1:5198',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: false,
  },
})
