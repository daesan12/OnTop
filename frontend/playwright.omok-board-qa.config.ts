import { defineConfig } from '@playwright/test'
import base from './playwright.park.config'
import os from 'node:os'
import path from 'node:path'

// 오목 QA 전용 포트. HTTP/WS fixture는 실제 서버와 분리한다.
// node node_modules/@playwright/test/cli.js test --config playwright.omok-board-qa.config.ts omok-board-qa.spec.ts
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5292' },
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(os.tmpdir(), 'ontop-omok-board-qa'),
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5292 --strictPort',
    url: 'http://127.0.0.1:5292', reuseExistingServer: false,
  },
})
