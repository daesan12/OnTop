import {defineConfig} from '@playwright/test'
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'npc-opponent.spec.ts',workers:1,timeout:30000,
 outputDir:'../output/npc-opponent-20261112',
 use:{baseURL:'http://127.0.0.1:5243',channel:'msedge',headless:true,viewport:{width:1440,height:900}},
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5243 --strictPort',url:'http://127.0.0.1:5243',reuseExistingServer:false},
})
