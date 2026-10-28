import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({
  testDir: './tests/e2e',
  // Preview-only assertions use their dedicated configs; proposed game contracts are opt-in.
  testIgnore: ['**/reward-coins.spec.ts', '**/onecard-defense.spec.ts', '**/bungeoppang-ranking.spec.ts', '**/tablet-flow.spec.ts', '**/m04.spec.ts', '**/m05.spec.ts', '**/m06.spec.ts', '**/m07.spec.ts', '**/m08.spec.ts', '**/m09.spec.ts', '**/m10.spec.ts', '**/m11.spec.ts', '**/m12.spec.ts', '**/m13.spec.ts', '**/manual-preview.spec.ts', '**/follow-preview.spec.ts'],
  timeout: 120_000,
  workers: 1,
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(os.tmpdir(), 'ontop-fe-e2e'),
  use: {
    baseURL: 'http://127.0.0.1:5197',
    channel: 'msedge',
    viewport: { width: 1920, height: 1080 },
    headless: true,
    trace: 'off',
  },
  webServer: {
    // Existing AUTO compatibility scenarios; normal default-on seating is covered
    // separately by playwright.tablet-default.config.ts without --mode tablet.
    env: { VITE_TABLET_LOBBY: 'false' },
    command: 'pnpm dev --host 127.0.0.1 --port 5197 --strictPort',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: false,
  },
})
