import { defineConfig } from '@playwright/test'
import base from './playwright.config'
const port = Number(process.env.REWARD_PREVIEW_PORT ?? 5236)
export default defineConfig({
  ...base, testMatch: '**/reward-coins.spec.ts', testIgnore: [],
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    env: { VITE_TABLET_LOBBY: process.env.REWARD_TABLET === 'false' ? 'false' : 'true', VITE_BUNGEOPPANG_RANKINGS: 'false' },
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false,
  },
})
