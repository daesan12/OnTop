import {defineConfig} from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
export default defineConfig({testDir:'./tests/park-live',workers:1,timeout:90000,
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR??path.join(os.tmpdir(),'ontop-park-live-results'),
  use:{baseURL:'http://127.0.0.1:5203',channel:process.platform==='win32'?'msedge':undefined,headless:true,viewport:{width:1920,height:1080}},
  webServer:{command:'node node_modules/vite/bin/vite.js --config vite.park-live.config.ts --host 127.0.0.1 --port 5203 --strictPort',url:'http://127.0.0.1:5203',reuseExistingServer:false},
})
