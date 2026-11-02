import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import base from './playwright.park.config'

// 독립 안내 프리뷰와 최신 공원의 E 상호작용. 실제 서버 대신 기존 HTTP/WS fixture 사용.
// node node_modules/@playwright/test/cli.js test --config playwright.jumpmap-guide.config.ts jumpmap-guide.spec.ts
export default defineConfig({
  ...base,
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR??path.join(os.tmpdir(),'ontop-jumpmap-guide'),
  use:{...base.use,baseURL:'http://127.0.0.1:5294'},
  webServer:{command:'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5294 --strictPort',
    url:'http://127.0.0.1:5294',reuseExistingServer:false},
})
