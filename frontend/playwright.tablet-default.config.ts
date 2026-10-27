import { defineConfig } from '@playwright/test'
import tablet from './playwright.tablet.config'

// Exercise ordinary Vite development, not a forced tablet mode or true feature flag.
export default defineConfig({
  ...tablet,
  use: { ...tablet.use, baseURL: 'http://127.0.0.1:5204' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5204 --strictPort',
    env: { VITE_TABLET_LOBBY: '' },
    url: 'http://127.0.0.1:5204', reuseExistingServer: false,
  },
})
