import {defineConfig} from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
export default defineConfig({testDir:'./tests/park-integration',workers:1,timeout:120000,
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR??path.join(os.tmpdir(),'ontop-park-integration-results'),
  use:{baseURL:'http://127.0.0.1:5202',channel:'msedge',headless:true,viewport:{width:1920,height:1080}},
  webServer:{command:'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5202 --strictPort',url:'http://127.0.0.1:5202',reuseExistingServer:false},
})
