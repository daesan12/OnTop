import {defineConfig} from '@playwright/test'
import base from './playwright.park.config'
import path from 'node:path'
import os from 'node:os'

export default defineConfig({
  ...base,
  testMatch:'follow-debris.spec.ts',
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR??path.join(os.tmpdir(),'ontop-follow-forfeit-results'),
  use:{...base.use,baseURL:'http://127.0.0.1:5236',actionTimeout:10000},
  webServer:{command:'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5236 --strictPort',
    url:'http://127.0.0.1:5236',reuseExistingServer:false},
})
