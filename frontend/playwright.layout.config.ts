import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({
  timeout:120000,workers:1,
  projects:[
    {name:'layout-review',testDir:'./tests/layout-e2e'},
    {name:'existing-art',testDir:'./tests/e2e',testMatch:['pavilion-furniture.spec.ts','code-props.spec.ts']},
    {name:'fitness-regression',testDir:'./tests/e2e',testMatch:['fitness-boundary.spec.ts']},
  ],
  outputDir:path.join(os.tmpdir(),'ontop-layout-e2e'),
  use:{baseURL:'http://127.0.0.1:5201',channel:'msedge',headless:true,viewport:{width:1920,height:1080}},
  webServer:{command:'node node_modules/vite/bin/vite.js --mode layout-preview --host 127.0.0.1 --port 5201 --strictPort',url:'http://127.0.0.1:5201',reuseExistingServer:true},
})
