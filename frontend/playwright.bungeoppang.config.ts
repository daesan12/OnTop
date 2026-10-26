import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Isolated v4 preview: visual/interaction regression only, never an API-error fallback.
export default defineConfig({
  ...base,
  testDir: './tests/bungeoppang-v4-e2e',
  testIgnore: [],
  timeout: 150_000,
  use: {
    ...base.use,
    baseURL: 'http://127.0.0.1:5195',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'pnpm dev:bungeoppang --host 127.0.0.1 --port 5195 --strictPort',
    url: 'http://127.0.0.1:5195',
    reuseExistingServer: false,
  },
})
