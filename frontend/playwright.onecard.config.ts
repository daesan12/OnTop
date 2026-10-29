import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

const port = Number(process.env.ONECARD_PREVIEW_PORT ?? 5213)
export default defineConfig({
  testDir: './tests/e2e', testMatch: ['onecard.spec.ts', 'onecard-ux.spec.ts', 'onecard-four-player.spec.ts', 'onecard-controls.spec.ts', 'onecard-interactions.spec.ts', 'game-additions-disabled.spec.ts', 'game-forfeit.spec.ts', 'navigation.spec.ts'], timeout: 120_000, workers: 1,
  outputDir: path.join(os.tmpdir(), 'ontop-onecard-ux-e2e'),
  use: { baseURL: `http://127.0.0.1:${port}`, channel: 'msedge', viewport: { width: 1920, height: 1080 }, headless: true, trace: 'off' },
  webServer: { env: { VITE_TABLET_LOBBY: 'false', VITE_ONECARD_PRANKS: 'true', VITE_ONECARD_PRANK_DEFENSE: 'false', VITE_BUNGEOPPANG_RANKINGS: 'false' },
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
})
