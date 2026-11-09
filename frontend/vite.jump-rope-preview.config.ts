import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'mpa',
  cacheDir: '.vite-cache/jump-rope-preview',
  plugins: [react()],
  optimizeDeps: { entries: ['__dev/jump-rope.html'] },
  server: { host: '127.0.0.1', port: 5206, strictPort: true },
})
