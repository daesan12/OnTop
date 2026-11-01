import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import base from './playwright.park.config'

// 최신 생성 맵의 원카드 HUD 독립 QA. HTTP/WS fixture를 사용한다.
// node node_modules/@playwright/test/cli.js test --config playwright.onecard-hud-qa.config.ts
export default defineConfig({
  ...base,
  testMatch: ['**/onecard-hud-qa.spec.ts','**/onecard-qa.spec.ts'],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(os.tmpdir(),'ontop-onecard-hud-qa'),
  use: { ...base.use, baseURL:'http://127.0.0.1:5293' },
  webServer: {
    command:'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5293 --strictPort',
    url:'http://127.0.0.1:5293', reuseExistingServer:false,
  },
})
