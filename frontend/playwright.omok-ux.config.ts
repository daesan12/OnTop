import { defineConfig } from '@playwright/test'
import base from './playwright.omok-feedback.config'

/** Current default tablet flow; older AUTO fixtures keep their own compatibility config. */
export default defineConfig({
  ...base,
  testMatch: '**/omok-ux.spec.ts',
  webServer: { ...base.webServer, env: { ...base.webServer.env, VITE_TABLET_LOBBY: 'true' } },
})
