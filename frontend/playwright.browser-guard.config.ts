import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: '**/browser-shortcuts.spec.ts',
  testIgnore: [],
  projects: [
    { name: 'edge', use: { channel: 'msedge' }, metadata: { generatedPark: true } },
    { name: 'chrome', use: { channel: 'chrome' }, metadata: { generatedPark: true } },
  ],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5236' },
  webServer: {
    ...base.webServer,
    env: { VITE_TABLET_LOBBY: 'false', VITE_BROWSER_SHORTCUT_GUARD: 'true' },
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5236 --strictPort',
    url: 'http://127.0.0.1:5236',
    reuseExistingServer: false,
  },
})
