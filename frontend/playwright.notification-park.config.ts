import { defineConfig } from '@playwright/test'
import notifications from './playwright.notifications.config'

export default defineConfig({
  ...notifications,
  testMatch:'notification-park-rewards.spec.ts',timeout:120000,
  outputDir:'../output/notification-park-rewards',
  use:{...notifications.use,baseURL:'http://127.0.0.1:5229'},
  webServer:{command:'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5229 --strictPort',
    url:'http://127.0.0.1:5229',reuseExistingServer:false},
})
