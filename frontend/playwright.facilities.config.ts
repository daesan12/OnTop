import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Missing emotes are previewed only in this explicit development mode.
// M01 now exercises real facility messages in the normal configuration.
export default defineConfig({
  ...base,
  testMatch: /(?:m(?:0[2-9]|1[0-3])|manual-preview|follow-preview)\.spec\.ts/,
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5196' },
  webServer: {
    command: 'pnpm dev:facilities --host 127.0.0.1 --port 5196 --strictPort',
    url: 'http://127.0.0.1:5196',
    reuseExistingServer: false,
  },
})
