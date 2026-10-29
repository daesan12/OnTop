import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: '**/browser-shortcuts.spec.ts',
  testIgnore: [],
  webServer: {
    ...base.webServer,
    env: { VITE_TABLET_LOBBY: 'false', VITE_BROWSER_SHORTCUT_GUARD: 'true' },
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: false,
  },
})
