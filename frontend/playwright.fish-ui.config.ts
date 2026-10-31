import {defineConfig} from '@playwright/test'
import base from './playwright.park.config'
import path from 'node:path'
import os from 'node:os'

export default defineConfig({
  ...base,
  testMatch:'fish-ready-ui.spec.ts',
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR??path.join(os.tmpdir(),'ontop-fish-ready-ui-results'),
  use:{...base.use,baseURL:'http://127.0.0.1:5227',actionTimeout:10000},
  webServer:{command:'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5227 --strictPort',
    url:'http://127.0.0.1:5227',reuseExistingServer:false},
})
