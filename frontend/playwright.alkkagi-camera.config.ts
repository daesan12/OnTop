import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({
  testDir:'tests/e2e',testMatch:'alkkagi-camera-exit.spec.ts',timeout:120000,workers:1,
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR??path.join(os.tmpdir(),'ontop-alkkagi-camera'),
  use:{baseURL:'http://127.0.0.1:5210',channel:'msedge',headless:true,viewport:{width:1440,height:900}},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5210 --strictPort',
    url:'http://127.0.0.1:5210',reuseExistingServer:false,env:{VITE_ALKKAGI_ENABLED:'true',VITE_TABLET_LOBBY:'false'}},
})
