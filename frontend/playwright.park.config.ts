import {defineConfig} from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
const renewal = process.env.PARK_INTEGRATION_MAP === 'renewal'
const port = Number(process.env.PARK_INTEGRATION_PORT ?? (renewal ? 5291 : 5202))
const baseURL = `http://127.0.0.1:${port}`
const mode = renewal ? 'park-renewal-integration' : 'park-integration'
export default defineConfig({testDir:'./tests/park-integration',workers:1,timeout:120000,
  ...(renewal ? { testMatch: 'omok-daylight.spec.ts', grep: /@renewal-board/ } : {}),
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR??path.join(os.tmpdir(),renewal?'ontop-renewal-board-results':'ontop-park-integration-results'),
  use:{baseURL,channel:renewal?'chrome':'msedge',headless:true,viewport:{width:1920,height:1080}},
  webServer:{command:`node node_modules/vite/bin/vite.js --mode ${mode} --host 127.0.0.1 --port ${port} --strictPort`,url:baseURL,reuseExistingServer:false},
})
