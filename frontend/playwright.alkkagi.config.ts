import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/alkkagi', workers: 1, timeout: 30000,
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:5206', viewport: { width: 1280, height: 960 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  reporter: [['list']], outputDir: '.vite-cache/alkkagi-test-results',
})
