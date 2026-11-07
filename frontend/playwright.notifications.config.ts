import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests/e2e',testMatch:['notifications.spec.ts','notification-rewards.spec.ts'],workers:1,timeout:60000,
  outputDir:'../output/notification-browser-tests',
  use:{baseURL:'http://127.0.0.1:5228',channel:'msedge',headless:true,viewport:{width:1920,height:1080},video:'on'},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5228 --strictPort',url:'http://127.0.0.1:5228',reuseExistingServer:false},
})
