import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'notes-preview.spec.ts',
  timeout: 60000,
  workers: 1,
  outputDir: path.join(os.tmpdir(), 'ontop-notes-preview'),
  use: {
    channel: 'msedge', headless: true,
    baseURL: 'http://127.0.0.1:5205',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'pnpm exec vite --mode notes-preview --host 127.0.0.1 --port 5205 --strictPort',
    url: 'http://127.0.0.1:5205/notes-preview.html',
    reuseExistingServer: true,
  },
})
