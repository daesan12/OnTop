import { defineConfig } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

const renewal = process.env.PARK_XR_MAP === 'renewal'
const mode = renewal ? 'park-renewal-integration' : 'park-integration'
const port = Number(process.env.PARK_XR_PORT ?? (renewal ? 5290 : 5289))
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/park-xr', workers: 1, timeout: 120000,
  ...(renewal ? { testMatch: ['renewal.spec.ts', 'device-feedback.spec.ts', 'chat.spec.ts', 'crowd.spec.ts', 'omok.spec.ts', 'telescope.spec.ts', 'balloon.spec.ts'] } : { testIgnore: ['renewal.spec.ts', 'chat.spec.ts', 'crowd.spec.ts', 'telescope.spec.ts', 'balloon.spec.ts'] }),
  outputDir: path.join(os.tmpdir(), renewal ? 'ontop-park-xr-renewal-results' : 'ontop-park-xr-results'),
  use: { baseURL, channel: 'chrome', headless: true,
    viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: `node node_modules/vite/bin/vite.js --mode ${mode} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, env: { VITE_LOCAL_BALLOON: renewal ? '1' : '0' } },
})
